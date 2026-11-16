<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model;

use Magento\Framework\Api\SearchResults;
use Solcart\StageCraft\Api\Data\CommentSearchResultsInterface;

class CommentSearchResults extends SearchResults implements CommentSearchResultsInterface
{
}
