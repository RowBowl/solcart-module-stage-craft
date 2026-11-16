<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Api;

use Magento\Framework\Api\SearchCriteriaInterface;
use Magento\Framework\Exception\CouldNotDeleteException;
use Magento\Framework\Exception\CouldNotSaveException;
use Magento\Framework\Exception\NoSuchEntityException;
use Solcart\StageCraft\Api\Data\CommentInterface;
use Solcart\StageCraft\Api\Data\CommentSearchResultsInterface;

/**
 * Repository contract for PageBuilder collaborative comments.
 *
 * @api
 */
interface CommentRepositoryInterface
{
    /**
     * Persist a comment entity.
     *
     * @param CommentInterface $comment
     * @return CommentInterface
     * @throws CouldNotSaveException
     */
    public function save(CommentInterface $comment): CommentInterface;

    /**
     * Retrieve a comment by ID.
     *
     * @param int $commentId
     * @return CommentInterface
     * @throws NoSuchEntityException
     */
    public function getById(int $commentId): CommentInterface;

    /**
     * Retrieve comments matching search criteria.
     *
     * @param SearchCriteriaInterface $searchCriteria
     * @return CommentSearchResultsInterface
     */
    public function getList(SearchCriteriaInterface $searchCriteria): CommentSearchResultsInterface;

    /**
     * Retrieve all comments belonging to a PageBuilder instance key.
     *
     * @param string $instanceKey
     * @return CommentInterface[]
     */
    public function getByInstanceKey(string $instanceKey): array;

    /**
     * Delete a comment entity.
     *
     * @param CommentInterface $comment
     * @return bool
     * @throws CouldNotDeleteException
     */
    public function delete(CommentInterface $comment): bool;

    /**
     * Delete a comment by ID.
     *
     * @param int $commentId
     * @return bool
     * @throws NoSuchEntityException
     * @throws CouldNotDeleteException
     */
    public function deleteById(int $commentId): bool;
}
