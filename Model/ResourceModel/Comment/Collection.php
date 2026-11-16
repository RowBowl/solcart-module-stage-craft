<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model\ResourceModel\Comment;

use Magento\Framework\Model\ResourceModel\Db\Collection\AbstractCollection;
use Solcart\StageCraft\Api\Data\CommentInterface;
use Solcart\StageCraft\Model\Comment as CommentModel;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;

class Collection extends AbstractCollection
{
    /**
     * @var string
     */
    protected $_idFieldName = CommentInterface::COMMENT_ID;

    /**
     * @var string
     */
    protected $_eventPrefix = 'solcart_stagecraft_comment_collection';

    /**
     * @var string
     */
    protected $_eventObject = 'comment_collection';

    /**
     * @inheritdoc
     */
    protected function _construct(): void
    {
        $this->_init(CommentModel::class, CommentResource::class);
    }
}
