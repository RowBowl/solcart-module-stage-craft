<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\Stdlib\DateTime\DateTime;
use Magento\User\Model\ResourceModel\User\CollectionFactory as UserCollectionFactory;
use Solcart\StageCraft\Api\CollaborationManagementInterface;
use Solcart\StageCraft\Api\CommentRepositoryInterface;
use Solcart\StageCraft\Api\Data\CommentInterface;
use Solcart\StageCraft\Api\Data\CommentInterfaceFactory;

class CollaborationManagement implements CollaborationManagementInterface
{
    /**
     * @param CommentRepositoryInterface $commentRepository
     * @param CommentInterfaceFactory $commentFactory
     * @param UserCollectionFactory $userCollectionFactory
     * @param Json $jsonSerializer
     * @param DateTime $dateTime
     */
    public function __construct(
        private readonly CommentRepositoryInterface $commentRepository,
        private readonly CommentInterfaceFactory $commentFactory,
        private readonly UserCollectionFactory $userCollectionFactory,
        private readonly Json $jsonSerializer,
        private readonly DateTime $dateTime
    ) {
    }

    /**
     * @inheritdoc
     */
    public function getThreadPayload(string $instanceKey): array
    {
        $instanceKey = trim($instanceKey);
        if ($instanceKey === '') {
            return [
                'instance_key' => '',
                'threads' => [],
                'counts' => [
                    'total_threads' => 0,
                    'open_threads' => 0,
                    'resolved_threads' => 0,
                    'page_open' => 0,
                    'row_open' => 0,
                    'by_target_id' => [],
                    'by_structural_path' => [],
                ],
            ];
        }

        $comments = $this->commentRepository->getByInstanceKey($instanceKey);
        $roots = [];
        $repliesByParent = [];

        foreach ($comments as $comment) {
            $serialized = $this->formatComment($comment);
            $parentId = $comment->getParentId();
            if ($parentId === null || $parentId <= 0) {
                $serialized['replies'] = [];
                $roots[(int)$comment->getCommentId()] = $serialized;
            } else {
                $repliesByParent[$parentId][] = $serialized;
            }
        }

        foreach ($repliesByParent as $parentId => $replies) {
            if (isset($roots[$parentId])) {
                $roots[$parentId]['replies'] = $replies;
            }
        }

        $threads = array_values($roots);
        $counts = $this->calculateCounts($threads);

        return [
            'instance_key' => $instanceKey,
            'threads' => $threads,
            'counts' => $counts,
        ];
    }

    /**
     * @inheritdoc
     */
    public function createComment(
        array $payload,
        ?int $adminUserId,
        string $authorName,
        string $authorUsername
    ): array {
        $instanceKey = trim((string)($payload['instance_key'] ?? ''));
        $commentText = trim((string)($payload['comment_text'] ?? ''));

        if ($instanceKey === '') {
            throw new LocalizedException(__('PageBuilder instance key is required.'));
        }
        if ($commentText === '') {
            throw new LocalizedException(__('Comment text cannot be empty.'));
        }

        $parentId = isset($payload['parent_id']) && $payload['parent_id'] !== ''
            ? (int)$payload['parent_id']
            : null;

        $entityType = trim((string)($payload['entity_type'] ?? 'cms_page')) ?: 'cms_page';
        $entityId = trim((string)($payload['entity_id'] ?? '0')) ?: '0';
        $fieldName = trim((string)($payload['field_name'] ?? 'content')) ?: 'content';
        $targetType = strtolower(trim((string)($payload['target_type'] ?? CommentInterface::TARGET_TYPE_ROW)))
            ?: CommentInterface::TARGET_TYPE_ROW;
        $targetId = trim((string)($payload['target_id'] ?? CommentInterface::TARGET_TYPE_PAGE))
            ?: CommentInterface::TARGET_TYPE_PAGE;
        $structuralPath = isset($payload['structural_path']) && trim((string)$payload['structural_path']) !== ''
            ? trim((string)$payload['structural_path'])
            : null;
        $targetLabel = isset($payload['target_label']) && trim((string)$payload['target_label']) !== ''
            ? trim((string)$payload['target_label'])
            : ucfirst($targetType);

        if ($parentId !== null && $parentId > 0) {
            $parentComment = $this->commentRepository->getById($parentId);
            $instanceKey = $parentComment->getInstanceKey();
            $entityType = $parentComment->getEntityType();
            $entityId = $parentComment->getEntityId();
            $fieldName = $parentComment->getFieldName();
            $targetType = $parentComment->getTargetType();
            $targetId = $parentComment->getTargetId();
            $structuralPath = $parentComment->getStructuralPath();
            $targetLabel = $parentComment->getTargetLabel();
        }

        $mentions = $this->extractMentions($commentText);

        $comment = $this->commentFactory->create();
        $comment->setParentId($parentId);
        $comment->setInstanceKey($instanceKey);
        $comment->setEntityType($entityType);
        $comment->setEntityId($entityId);
        $comment->setFieldName($fieldName);
        $comment->setTargetType($targetType);
        $comment->setTargetId($targetId);
        $comment->setStructuralPath($structuralPath);
        $comment->setTargetLabel($targetLabel);
        $comment->setAdminUserId($adminUserId);
        $comment->setAuthorName($authorName !== '' ? $authorName : 'Admin User');
        $comment->setAuthorUsername($authorUsername !== '' ? $authorUsername : 'admin');
        $comment->setCommentText($commentText);
        $comment->setMentionsJson($this->jsonSerializer->serialize($mentions));
        $comment->setStatus(CommentInterface::STATUS_OPEN);

        if (isset($payload['pin_x']) && is_numeric($payload['pin_x'])) {
            $comment->setPinX((float)$payload['pin_x']);
        }
        if (isset($payload['pin_y']) && is_numeric($payload['pin_y'])) {
            $comment->setPinY((float)$payload['pin_y']);
        }

        $savedComment = $this->commentRepository->save($comment);
        $result = $this->getThreadPayload($instanceKey);
        $result['created_comment'] = $this->formatComment($savedComment);

        return $result;
    }

    /**
     * @inheritdoc
     */
    public function updateStatus(
        int $commentId,
        string $status,
        ?int $adminUserId,
        string $adminDisplayName
    ): array {
        $normalizedStatus = strtolower(trim($status));
        if (!in_array($normalizedStatus, [CommentInterface::STATUS_OPEN, CommentInterface::STATUS_RESOLVED], true)) {
            throw new LocalizedException(__('Invalid comment status "%1".', $status));
        }

        $comment = $this->commentRepository->getById($commentId);
        $comment->setStatus($normalizedStatus);

        if ($normalizedStatus === CommentInterface::STATUS_RESOLVED) {
            $comment->setResolvedBy($adminUserId);
            $comment->setResolvedByName($adminDisplayName);
            $comment->setResolvedAt($this->dateTime->gmtDate());
        } else {
            $comment->setResolvedBy(null);
            $comment->setResolvedByName(null);
            $comment->setResolvedAt(null);
        }

        $this->commentRepository->save($comment);

        return $this->getThreadPayload($comment->getInstanceKey());
    }

    /**
     * @inheritdoc
     */
    public function deleteComment(int $commentId): array
    {
        $comment = $this->commentRepository->getById($commentId);
        $instanceKey = $comment->getInstanceKey();
        $this->commentRepository->delete($comment);

        return $this->getThreadPayload($instanceKey);
    }

    /**
     * @inheritdoc
     */
    public function getMentionableAdminUsers(): array
    {
        $collection = $this->userCollectionFactory->create();
        $collection->addFieldToFilter('is_active', 1);
        $collection->setOrder('firstname', 'ASC');
        $collection->setPageSize(100);

        $users = [];
        foreach ($collection as $user) {
            $username = (string)$user->getUserName();
            if ($username === '') {
                continue;
            }
            $fullName = trim((string)$user->getFirstName() . ' ' . (string)$user->getLastName());
            $users[] = [
                'user_id' => (int)$user->getId(),
                'username' => $username,
                'name' => $fullName !== '' ? $fullName : $username,
                'email' => (string)$user->getEmail(),
            ];
        }

        return $users;
    }

    /**
     * Extract unique @username mentions from comment text.
     *
     * @param string $commentText
     * @return string[]
     */
    public function extractMentions(string $commentText): array
    {
        if (!preg_match_all('/@([a-zA-Z0-9._-]{2,64})/', $commentText, $matches)) {
            return [];
        }

        $usernames = array_map('strtolower', $matches[1]);
        return array_values(array_unique($usernames));
    }

    /**
     * Convert CommentInterface to associative array for JSON serialization.
     *
     * @param CommentInterface $comment
     * @return array
     */
    private function formatComment(CommentInterface $comment): array
    {
        $mentions = [];
        $mentionsJson = $comment->getMentionsJson();
        if ($mentionsJson !== null && $mentionsJson !== '') {
            try {
                $decoded = $this->jsonSerializer->unserialize($mentionsJson);
                if (is_array($decoded)) {
                    $mentions = array_values($decoded);
                }
            } catch (\InvalidArgumentException) {
                $mentions = [];
            }
        }

        return [
            'comment_id' => $comment->getCommentId(),
            'parent_id' => $comment->getParentId(),
            'instance_key' => $comment->getInstanceKey(),
            'entity_type' => $comment->getEntityType(),
            'entity_id' => $comment->getEntityId(),
            'field_name' => $comment->getFieldName(),
            'target_type' => $comment->getTargetType(),
            'target_id' => $comment->getTargetId(),
            'structural_path' => $comment->getStructuralPath(),
            'target_label' => $comment->getTargetLabel(),
            'admin_user_id' => $comment->getAdminUserId(),
            'author_name' => $comment->getAuthorName(),
            'author_username' => $comment->getAuthorUsername(),
            'comment_text' => $comment->getCommentText(),
            'mentions' => $mentions,
            'status' => $comment->getStatus(),
            'resolved_by' => $comment->getResolvedBy(),
            'resolved_by_name' => $comment->getResolvedByName(),
            'resolved_at' => $comment->getResolvedAt(),
            'pin_x' => $comment->getPinX(),
            'pin_y' => $comment->getPinY(),
            'created_at' => $comment->getCreatedAt(),
            'updated_at' => $comment->getUpdatedAt(),
        ];
    }

    /**
     * Compute aggregate counts per target_id and structural_path.
     *
     * @param array $threads
     * @return array
     */
    private function calculateCounts(array $threads): array
    {
        $totalThreads = count($threads);
        $openThreads = 0;
        $resolvedThreads = 0;
        $pageOpen = 0;
        $rowOpen = 0;
        $byTargetId = [];
        $byStructuralPath = [];

        foreach ($threads as $thread) {
            $isOpen = ($thread['status'] ?? CommentInterface::STATUS_OPEN) === CommentInterface::STATUS_OPEN;
            $targetType = (string)($thread['target_type'] ?? CommentInterface::TARGET_TYPE_ROW);
            $targetId = (string)($thread['target_id'] ?? '');
            $structuralPath = (string)($thread['structural_path'] ?? '');
            $replyCount = isset($thread['replies']) && is_array($thread['replies']) ? count($thread['replies']) : 0;

            $mentionMap = [];
            if (is_array($thread['mentions'] ?? null)) {
                foreach ($thread['mentions'] as $mention) {
                    $mentionMap[(string)$mention] = true;
                }
            }
            if (!empty($thread['replies']) && is_array($thread['replies'])) {
                foreach ($thread['replies'] as $reply) {
                    if (!empty($reply['mentions']) && is_array($reply['mentions'])) {
                        foreach ($reply['mentions'] as $replyMention) {
                            $mentionMap[(string)$replyMention] = true;
                        }
                    }
                }
            }
            $allMentions = array_keys($mentionMap);

            if ($isOpen) {
                $openThreads++;
                if ($targetType === CommentInterface::TARGET_TYPE_PAGE) {
                    $pageOpen++;
                } else {
                    $rowOpen++;
                }
            } else {
                $resolvedThreads++;
            }

            if ($targetId !== '') {
                if (!isset($byTargetId[$targetId])) {
                    $byTargetId[$targetId] = [
                        'total' => 0,
                        'open' => 0,
                        'resolved' => 0,
                        'messages' => 0,
                        'mentions' => [],
                    ];
                }
                $byTargetId[$targetId]['total']++;
                $byTargetId[$targetId][$isOpen ? 'open' : 'resolved']++;
                $byTargetId[$targetId]['messages'] += (1 + $replyCount);
                foreach ($allMentions as $itemMention) {
                    if (!in_array($itemMention, $byTargetId[$targetId]['mentions'], true)) {
                        $byTargetId[$targetId]['mentions'][] = $itemMention;
                    }
                }
            }

            if ($structuralPath !== '') {
                if (!isset($byStructuralPath[$structuralPath])) {
                    $byStructuralPath[$structuralPath] = [
                        'total' => 0,
                        'open' => 0,
                        'resolved' => 0,
                        'messages' => 0,
                        'mentions' => [],
                    ];
                }
                $byStructuralPath[$structuralPath]['total']++;
                $byStructuralPath[$structuralPath][$isOpen ? 'open' : 'resolved']++;
                $byStructuralPath[$structuralPath]['messages'] += (1 + $replyCount);
                foreach ($allMentions as $pathMention) {
                    if (!in_array($pathMention, $byStructuralPath[$structuralPath]['mentions'], true)) {
                        $byStructuralPath[$structuralPath]['mentions'][] = $pathMention;
                    }
                }
            }
        }

        return [
            'total_threads' => $totalThreads,
            'open_threads' => $openThreads,
            'resolved_threads' => $resolvedThreads,
            'page_open' => $pageOpen,
            'row_open' => $rowOpen,
            'by_target_id' => $byTargetId,
            'by_structural_path' => $byStructuralPath,
        ];
    }
}
