<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Api\Data;

/**
 * PageBuilder collaborative comment data interface.
 *
 * @api
 */
interface CommentInterface
{
    public const COMMENT_ID = 'comment_id';
    public const PARENT_ID = 'parent_id';
    public const INSTANCE_KEY = 'instance_key';
    public const ENTITY_TYPE = 'entity_type';
    public const ENTITY_ID = 'entity_id';
    public const FIELD_NAME = 'field_name';
    public const TARGET_TYPE = 'target_type';
    public const TARGET_ID = 'target_id';
    public const STRUCTURAL_PATH = 'structural_path';
    public const TARGET_LABEL = 'target_label';
    public const ADMIN_USER_ID = 'admin_user_id';
    public const AUTHOR_NAME = 'author_name';
    public const AUTHOR_USERNAME = 'author_username';
    public const COMMENT_TEXT = 'comment_text';
    public const MENTIONS_JSON = 'mentions_json';
    public const STATUS = 'status';
    public const RESOLVED_BY = 'resolved_by';
    public const RESOLVED_BY_NAME = 'resolved_by_name';
    public const RESOLVED_AT = 'resolved_at';
    public const PIN_X = 'pin_x';
    public const PIN_Y = 'pin_y';
    public const CREATED_AT = 'created_at';
    public const UPDATED_AT = 'updated_at';

    public const STATUS_OPEN = 'open';
    public const STATUS_RESOLVED = 'resolved';

    public const TARGET_TYPE_PAGE = 'page';
    public const TARGET_TYPE_ROW = 'row';

    /**
     * Get comment ID.
     *
     * @return int|null
     */
    public function getCommentId(): ?int;

    /**
     * Set comment ID.
     *
     * @param int $commentId
     * @return $this
     */
    public function setCommentId(int $commentId): self;

    /**
     * Get parent comment ID for threaded replies.
     *
     * @return int|null
     */
    public function getParentId(): ?int;

    /**
     * Set parent comment ID.
     *
     * @param int|null $parentId
     * @return $this
     */
    public function setParentId(?int $parentId): self;

    /**
     * Get PageBuilder instance key.
     *
     * @return string
     */
    public function getInstanceKey(): string;

    /**
     * Set PageBuilder instance key.
     *
     * @param string $instanceKey
     * @return $this
     */
    public function setInstanceKey(string $instanceKey): self;

    /**
     * Get entity type (e.g. cms_page, cms_block, catalog_product).
     *
     * @return string
     */
    public function getEntityType(): string;

    /**
     * Set entity type.
     *
     * @param string $entityType
     * @return $this
     */
    public function setEntityType(string $entityType): self;

    /**
     * Get entity ID.
     *
     * @return string
     */
    public function getEntityId(): string;

    /**
     * Set entity ID.
     *
     * @param int|string $entityId
     * @return $this
     */
    public function setEntityId($entityId): self;

    /**
     * Get form field name.
     *
     * @return string
     */
    public function getFieldName(): string;

    /**
     * Set form field name.
     *
     * @param string $fieldName
     * @return $this
     */
    public function setFieldName(string $fieldName): self;

    /**
     * Get target content type (page, row, text, banner, etc.).
     *
     * @return string
     */
    public function getTargetType(): string;

    /**
     * Set target content type.
     *
     * @param string $targetType
     * @return $this
     */
    public function setTargetType(string $targetType): self;

    /**
     * Get stable target UUID or "page".
     *
     * @return string
     */
    public function getTargetId(): string;

    /**
     * Set stable target UUID or "page".
     *
     * @param string $targetId
     * @return $this
     */
    public function setTargetId(string $targetId): self;

    /**
     * Get structural path fallback (e.g. row:0).
     *
     * @return string|null
     */
    public function getStructuralPath(): ?string;

    /**
     * Set structural path fallback.
     *
     * @param string|null $structuralPath
     * @return $this
     */
    public function setStructuralPath(?string $structuralPath): self;

    /**
     * Get human-readable target label.
     *
     * @return string|null
     */
    public function getTargetLabel(): ?string;

    /**
     * Set human-readable target label.
     *
     * @param string|null $targetLabel
     * @return $this
     */
    public function setTargetLabel(?string $targetLabel): self;

    /**
     * Get admin user ID.
     *
     * @return int|null
     */
    public function getAdminUserId(): ?int;

    /**
     * Set admin user ID.
     *
     * @param int|null $adminUserId
     * @return $this
     */
    public function setAdminUserId(?int $adminUserId): self;

    /**
     * Get author display name.
     *
     * @return string
     */
    public function getAuthorName(): string;

    /**
     * Set author display name.
     *
     * @param string $authorName
     * @return $this
     */
    public function setAuthorName(string $authorName): self;

    /**
     * Get author admin username.
     *
     * @return string
     */
    public function getAuthorUsername(): string;

    /**
     * Set author admin username.
     *
     * @param string $authorUsername
     * @return $this
     */
    public function setAuthorUsername(string $authorUsername): self;

    /**
     * Get comment body text.
     *
     * @return string
     */
    public function getCommentText(): string;

    /**
     * Set comment body text.
     *
     * @param string $commentText
     * @return $this
     */
    public function setCommentText(string $commentText): self;

    /**
     * Get JSON array of mentioned usernames.
     *
     * @return string|null
     */
    public function getMentionsJson(): ?string;

    /**
     * Set JSON array of mentioned usernames.
     *
     * @param string|null $mentionsJson
     * @return $this
     */
    public function setMentionsJson(?string $mentionsJson): self;

    /**
     * Get thread status (open, resolved).
     *
     * @return string
     */
    public function getStatus(): string;

    /**
     * Set thread status.
     *
     * @param string $status
     * @return $this
     */
    public function setStatus(string $status): self;

    /**
     * Get resolved by admin user ID.
     *
     * @return int|null
     */
    public function getResolvedBy(): ?int;

    /**
     * Set resolved by admin user ID.
     *
     * @param int|null $resolvedBy
     * @return $this
     */
    public function setResolvedBy(?int $resolvedBy): self;

    /**
     * Get resolved by admin display name.
     *
     * @return string|null
     */
    public function getResolvedByName(): ?string;

    /**
     * Set resolved by admin display name.
     *
     * @param string|null $resolvedByName
     * @return $this
     */
    public function setResolvedByName(?string $resolvedByName): self;

    /**
     * Get resolved timestamp.
     *
     * @return string|null
     */
    public function getResolvedAt(): ?string;

    /**
     * Set resolved timestamp.
     *
     * @param string|null $resolvedAt
     * @return $this
     */
    public function setResolvedAt(?string $resolvedAt): self;

    /**
     * Get relative horizontal pin coordinate (%).
     *
     * @return float|null
     */
    public function getPinX(): ?float;

    /**
     * Set relative horizontal pin coordinate (%).
     *
     * @param float|null $pinX
     * @return $this
     */
    public function setPinX(?float $pinX): self;

    /**
     * Get relative vertical pin coordinate (%).
     *
     * @return float|null
     */
    public function getPinY(): ?float;

    /**
     * Set relative vertical pin coordinate (%).
     *
     * @param float|null $pinY
     * @return $this
     */
    public function setPinY(?float $pinY): self;

    /**
     * Get created at timestamp.
     *
     * @return string|null
     */
    public function getCreatedAt(): ?string;

    /**
     * Set created at timestamp.
     *
     * @param string $createdAt
     * @return $this
     */
    public function setCreatedAt(string $createdAt): self;

    /**
     * Get updated at timestamp.
     *
     * @return string|null
     */
    public function getUpdatedAt(): ?string;

    /**
     * Set updated at timestamp.
     *
     * @param string $updatedAt
     * @return $this
     */
    public function setUpdatedAt(string $updatedAt): self;
}
