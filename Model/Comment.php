<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model;

use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Model\AbstractModel;
use Solcart\StageCraft\Api\Data\CommentInterface;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;

class Comment extends AbstractModel implements CommentInterface, IdentityInterface
{
    public const CACHE_TAG = 'solcart_stagecraft_comment';

    /**
     * @var string
     */
    protected $_cacheTag = self::CACHE_TAG;

    /**
     * @var string
     */
    protected $_eventPrefix = 'solcart_stagecraft_comment';

    /**
     * @inheritdoc
     */
    protected function _construct(): void
    {
        $this->_init(CommentResource::class);
    }

    /**
     * @inheritdoc
     */
    public function getIdentities(): array
    {
        return [self::CACHE_TAG . '_' . $this->getId()];
    }

    /**
     * @inheritdoc
     */
    public function getCommentId(): ?int
    {
        $value = $this->getData(self::COMMENT_ID);
        return $value !== null ? (int)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setCommentId(int $commentId): CommentInterface
    {
        return $this->setData(self::COMMENT_ID, $commentId);
    }

    /**
     * @inheritdoc
     */
    public function getParentId(): ?int
    {
        $value = $this->getData(self::PARENT_ID);
        return ($value !== null && $value !== '') ? (int)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setParentId(?int $parentId): CommentInterface
    {
        return $this->setData(self::PARENT_ID, $parentId);
    }

    /**
     * @inheritdoc
     */
    public function getInstanceKey(): string
    {
        return (string)$this->getData(self::INSTANCE_KEY);
    }

    /**
     * @inheritdoc
     */
    public function setInstanceKey(string $instanceKey): CommentInterface
    {
        return $this->setData(self::INSTANCE_KEY, $instanceKey);
    }

    /**
     * @inheritdoc
     */
    public function getEntityType(): string
    {
        return (string)($this->getData(self::ENTITY_TYPE) ?: 'cms_page');
    }

    /**
     * @inheritdoc
     */
    public function setEntityType(string $entityType): CommentInterface
    {
        return $this->setData(self::ENTITY_TYPE, $entityType);
    }

    /**
     * @inheritdoc
     */
    public function getEntityId(): string
    {
        return (string)($this->getData(self::ENTITY_ID) ?? '0');
    }

    /**
     * @inheritdoc
     */
    public function setEntityId($entityId): CommentInterface
    {
        return $this->setData(self::ENTITY_ID, (string)$entityId);
    }

    /**
     * @inheritdoc
     */
    public function getFieldName(): string
    {
        return (string)($this->getData(self::FIELD_NAME) ?: 'content');
    }

    /**
     * @inheritdoc
     */
    public function setFieldName(string $fieldName): CommentInterface
    {
        return $this->setData(self::FIELD_NAME, $fieldName);
    }

    /**
     * @inheritdoc
     */
    public function getTargetType(): string
    {
        return (string)($this->getData(self::TARGET_TYPE) ?: self::TARGET_TYPE_ROW);
    }

    /**
     * @inheritdoc
     */
    public function setTargetType(string $targetType): CommentInterface
    {
        return $this->setData(self::TARGET_TYPE, $targetType);
    }

    /**
     * @inheritdoc
     */
    public function getTargetId(): string
    {
        return (string)($this->getData(self::TARGET_ID) ?: self::TARGET_TYPE_PAGE);
    }

    /**
     * @inheritdoc
     */
    public function setTargetId(string $targetId): CommentInterface
    {
        return $this->setData(self::TARGET_ID, $targetId);
    }

    /**
     * @inheritdoc
     */
    public function getStructuralPath(): ?string
    {
        $value = $this->getData(self::STRUCTURAL_PATH);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setStructuralPath(?string $structuralPath): CommentInterface
    {
        return $this->setData(self::STRUCTURAL_PATH, $structuralPath);
    }

    /**
     * @inheritdoc
     */
    public function getTargetLabel(): ?string
    {
        $value = $this->getData(self::TARGET_LABEL);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setTargetLabel(?string $targetLabel): CommentInterface
    {
        return $this->setData(self::TARGET_LABEL, $targetLabel);
    }

    /**
     * @inheritdoc
     */
    public function getAdminUserId(): ?int
    {
        $value = $this->getData(self::ADMIN_USER_ID);
        return ($value !== null && $value !== '') ? (int)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setAdminUserId(?int $adminUserId): CommentInterface
    {
        return $this->setData(self::ADMIN_USER_ID, $adminUserId);
    }

    /**
     * @inheritdoc
     */
    public function getAuthorName(): string
    {
        return (string)$this->getData(self::AUTHOR_NAME);
    }

    /**
     * @inheritdoc
     */
    public function setAuthorName(string $authorName): CommentInterface
    {
        return $this->setData(self::AUTHOR_NAME, $authorName);
    }

    /**
     * @inheritdoc
     */
    public function getAuthorUsername(): string
    {
        return (string)$this->getData(self::AUTHOR_USERNAME);
    }

    /**
     * @inheritdoc
     */
    public function setAuthorUsername(string $authorUsername): CommentInterface
    {
        return $this->setData(self::AUTHOR_USERNAME, $authorUsername);
    }

    /**
     * @inheritdoc
     */
    public function getCommentText(): string
    {
        return (string)$this->getData(self::COMMENT_TEXT);
    }

    /**
     * @inheritdoc
     */
    public function setCommentText(string $commentText): CommentInterface
    {
        return $this->setData(self::COMMENT_TEXT, $commentText);
    }

    /**
     * @inheritdoc
     */
    public function getMentionsJson(): ?string
    {
        $value = $this->getData(self::MENTIONS_JSON);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setMentionsJson(?string $mentionsJson): CommentInterface
    {
        return $this->setData(self::MENTIONS_JSON, $mentionsJson);
    }

    /**
     * @inheritdoc
     */
    public function getStatus(): string
    {
        return (string)($this->getData(self::STATUS) ?: self::STATUS_OPEN);
    }

    /**
     * @inheritdoc
     */
    public function setStatus(string $status): CommentInterface
    {
        return $this->setData(self::STATUS, $status);
    }

    /**
     * @inheritdoc
     */
    public function getResolvedBy(): ?int
    {
        $value = $this->getData(self::RESOLVED_BY);
        return ($value !== null && $value !== '') ? (int)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setResolvedBy(?int $resolvedBy): CommentInterface
    {
        return $this->setData(self::RESOLVED_BY, $resolvedBy);
    }

    /**
     * @inheritdoc
     */
    public function getResolvedByName(): ?string
    {
        $value = $this->getData(self::RESOLVED_BY_NAME);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setResolvedByName(?string $resolvedByName): CommentInterface
    {
        return $this->setData(self::RESOLVED_BY_NAME, $resolvedByName);
    }

    /**
     * @inheritdoc
     */
    public function getResolvedAt(): ?string
    {
        $value = $this->getData(self::RESOLVED_AT);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setResolvedAt(?string $resolvedAt): CommentInterface
    {
        return $this->setData(self::RESOLVED_AT, $resolvedAt);
    }

    /**
     * @inheritdoc
     */
    public function getPinX(): ?float
    {
        $value = $this->getData(self::PIN_X);
        return ($value !== null && $value !== '') ? (float)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setPinX(?float $pinX): CommentInterface
    {
        return $this->setData(self::PIN_X, $pinX);
    }

    /**
     * @inheritdoc
     */
    public function getPinY(): ?float
    {
        $value = $this->getData(self::PIN_Y);
        return ($value !== null && $value !== '') ? (float)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setPinY(?float $pinY): CommentInterface
    {
        return $this->setData(self::PIN_Y, $pinY);
    }

    /**
     * @inheritdoc
     */
    public function getCreatedAt(): ?string
    {
        $value = $this->getData(self::CREATED_AT);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setCreatedAt(string $createdAt): CommentInterface
    {
        return $this->setData(self::CREATED_AT, $createdAt);
    }

    /**
     * @inheritdoc
     */
    public function getUpdatedAt(): ?string
    {
        $value = $this->getData(self::UPDATED_AT);
        return $value !== null ? (string)$value : null;
    }

    /**
     * @inheritdoc
     */
    public function setUpdatedAt(string $updatedAt): CommentInterface
    {
        return $this->setData(self::UPDATED_AT, $updatedAt);
    }
}
