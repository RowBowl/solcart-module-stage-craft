<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Api;

use Magento\Framework\Exception\CouldNotDeleteException;
use Magento\Framework\Exception\CouldNotSaveException;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Exception\NoSuchEntityException;

/**
 * High-level service contract for managing PageBuilder collaboration threads.
 *
 * @api
 */
interface CollaborationManagementInterface
{
    /**
     * Build structured thread & badge summary payload for a PageBuilder instance.
     *
     * @param string $instanceKey
     * @return array
     */
    public function getThreadPayload(string $instanceKey): array;

    /**
     * Create a new root comment or threaded reply.
     *
     * @param array $payload
     * @param int|null $adminUserId
     * @param string $authorName
     * @param string $authorUsername
     * @return array
     * @throws LocalizedException
     * @throws CouldNotSaveException
     */
    public function createComment(
        array $payload,
        ?int $adminUserId,
        string $authorName,
        string $authorUsername
    ): array;

    /**
     * Resolve or reopen a root comment thread.
     *
     * @param int $commentId
     * @param string $status
     * @param int|null $adminUserId
     * @param string $adminDisplayName
     * @return array
     * @throws NoSuchEntityException
     * @throws CouldNotSaveException
     * @throws LocalizedException
     */
    public function updateStatus(
        int $commentId,
        string $status,
        ?int $adminUserId,
        string $adminDisplayName
    ): array;

    /**
     * Delete a comment or reply and return updated instance payload.
     *
     * @param int $commentId
     * @return array
     * @throws NoSuchEntityException
     * @throws CouldNotDeleteException
     */
    public function deleteComment(int $commentId): array;

    /**
     * Return active admin users for @mention autocomplete.
     *
     * @return array
     */
    public function getMentionableAdminUsers(): array;
}
