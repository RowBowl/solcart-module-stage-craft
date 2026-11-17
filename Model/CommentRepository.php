<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model;

use Magento\Framework\Api\SearchCriteria\CollectionProcessorInterface;
use Magento\Framework\Api\SearchCriteriaBuilder;
use Magento\Framework\Api\SearchCriteriaInterface;
use Magento\Framework\Api\SortOrderBuilder;
use Magento\Framework\Exception\CouldNotDeleteException;
use Magento\Framework\Exception\CouldNotSaveException;
use Magento\Framework\Exception\NoSuchEntityException;
use Solcart\StageCraft\Api\CommentRepositoryInterface;
use Solcart\StageCraft\Api\Data\CommentInterface;
use Solcart\StageCraft\Api\Data\CommentSearchResultsInterface;
use Solcart\StageCraft\Api\Data\CommentSearchResultsInterfaceFactory;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;
use Solcart\StageCraft\Model\ResourceModel\Comment\CollectionFactory as CommentCollectionFactory;

class CommentRepository implements CommentRepositoryInterface
{
    /**
     * @param CommentResource $resource
     * @param CommentFactory $commentFactory
     * @param CommentCollectionFactory $collectionFactory
     * @param CommentSearchResultsInterfaceFactory $searchResultsFactory
     * @param CollectionProcessorInterface $collectionProcessor
     * @param SearchCriteriaBuilder $searchCriteriaBuilder
     * @param SortOrderBuilder $sortOrderBuilder
     */
    public function __construct(
        private readonly CommentResource $resource,
        private readonly CommentFactory $commentFactory,
        private readonly CommentCollectionFactory $collectionFactory,
        private readonly CommentSearchResultsInterfaceFactory $searchResultsFactory,
        private readonly CollectionProcessorInterface $collectionProcessor,
        private readonly SearchCriteriaBuilder $searchCriteriaBuilder,
        private readonly SortOrderBuilder $sortOrderBuilder
    ) {
    }

    /**
     * @inheritdoc
     */
    public function save(CommentInterface $comment): CommentInterface
    {
        try {
            if (str_contains($comment->getInstanceKey(), '#demo_')) {
                $this->resource->pruneExpiredDemoComments();
            }
            /** @var Comment $comment */
            $this->resource->save($comment);
        } catch (\Throwable $exception) {
            throw new CouldNotSaveException(
                __('Could not save the PageBuilder comment: %1', $exception->getMessage()),
                $exception
            );
        }

        return $comment;
    }

    /**
     * @inheritdoc
     */
    public function getById(int $commentId): CommentInterface
    {
        $comment = $this->commentFactory->create();
        $this->resource->load($comment, $commentId);
        if (!$comment->getCommentId()) {
            throw new NoSuchEntityException(
                __('The PageBuilder comment with ID "%1" does not exist.', $commentId)
            );
        }

        return $comment;
    }

    /**
     * @inheritdoc
     */
    public function getList(SearchCriteriaInterface $searchCriteria): CommentSearchResultsInterface
    {
        $collection = $this->collectionFactory->create();
        $this->collectionProcessor->process($searchCriteria, $collection);

        $searchResults = $this->searchResultsFactory->create();
        $searchResults->setSearchCriteria($searchCriteria);
        /** @var CommentInterface[] $items */
        $items = $collection->getItems();
        $searchResults->setItems($items);
        $searchResults->setTotalCount($collection->getSize());

        return $searchResults;
    }

    /**
     * @inheritdoc
     */
    public function getByInstanceKey(string $instanceKey): array
    {
        $sortOrder = $this->sortOrderBuilder
            ->setField(CommentInterface::CREATED_AT)
            ->setAscendingDirection()
            ->create();

        $idSortOrder = $this->sortOrderBuilder
            ->setField(CommentInterface::COMMENT_ID)
            ->setAscendingDirection()
            ->create();

        $searchCriteria = $this->searchCriteriaBuilder
            ->addFilter(CommentInterface::INSTANCE_KEY, $instanceKey)
            ->setSortOrders([$sortOrder, $idSortOrder])
            ->create();

        return array_values($this->getList($searchCriteria)->getItems());
    }

    /**
     * @inheritdoc
     */
    public function delete(CommentInterface $comment): bool
    {
        try {
            /** @var Comment $comment */
            $this->resource->delete($comment);
        } catch (\Throwable $exception) {
            throw new CouldNotDeleteException(
                __('Could not delete the PageBuilder comment: %1', $exception->getMessage()),
                $exception
            );
        }

        return true;
    }

    /**
     * @inheritdoc
     */
    public function deleteById(int $commentId): bool
    {
        return $this->delete($this->getById($commentId));
    }
}
