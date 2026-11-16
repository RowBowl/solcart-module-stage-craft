<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model\ResourceModel;

use Magento\Framework\Model\ResourceModel\Db\AbstractDb;
use Solcart\StageCraft\Api\Data\CommentInterface;

class Comment extends AbstractDb
{
    public const TABLE_NAME = 'solcart_stagecraft_comment';

    /**
     * @inheritdoc
     */
    protected function _construct(): void
    {
        $this->_init(self::TABLE_NAME, CommentInterface::COMMENT_ID);
    }
}
