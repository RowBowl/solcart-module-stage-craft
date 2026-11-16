<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Api\Data;

use Magento\Framework\Api\SearchResultsInterface;

/**
 * Search results interface for PageBuilder collaborative comments.
 *
 * @api
 */
interface CommentSearchResultsInterface extends SearchResultsInterface
{
    /**
     * Get comment list.
     *
     * @return \Solcart\StageCraft\Api\Data\CommentInterface[]
     */
    public function getItems();

    /**
     * Set comment list.
     *
     * @param \Solcart\StageCraft\Api\Data\CommentInterface[] $items
     * @return $this
     */
    public function setItems(array $items);
}
