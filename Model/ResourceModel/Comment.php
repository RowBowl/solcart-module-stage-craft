<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model\ResourceModel;

use Magento\Framework\DB\Sql\Expression;
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

    /**
     * Prune expired session-scoped demo comments (#demo_) and reopen old resolved baseline threads.
     *
     * @param int $maxAgeSeconds
     * @return void
     */
    public function pruneExpiredDemoComments(int $maxAgeSeconds = 7200): void
    {
        try {
            $connection = $this->getConnection();
            $table = $this->getMainTable();
            $cutoff = gmdate('Y-m-d H:i:s', time() - max(300, $maxAgeSeconds));

            $connection->delete(
                $table,
                [
                    'instance_key LIKE ?' => '%#demo_%',
                    'created_at < ?' => $cutoff,
                ]
            );

            $connection->update(
                $table,
                [
                    'status' => CommentInterface::STATUS_OPEN,
                    'resolved_by' => null,
                    'resolved_by_name' => null,
                    'resolved_at' => null,
                ],
                [
                    'instance_key NOT LIKE ?' => '%#demo_%',
                    'status = ?' => CommentInterface::STATUS_RESOLVED,
                    'resolved_at < ?' => $cutoff,
                ]
            );
        } catch (\Throwable) {
            return;
        }
    }

    /**
     * Migrate pre-save comments from a draft entity ID (e.g. "new" or "new_<token>") to a persisted entity ID.
     *
     * @param string $entityType
     * @param string $fromEntityId
     * @param string $toEntityId
     * @return int
     */
    public function migrateEntityComments(string $entityType, string $fromEntityId, string $toEntityId): int
    {
        $entityType = trim($entityType);
        $fromEntityId = trim($fromEntityId);
        $toEntityId = trim($toEntityId);

        if (
            $entityType === ''
            || $fromEntityId === ''
            || $toEntityId === ''
            || $fromEntityId === $toEntityId
        ) {
            return 0;
        }

        try {
            $connection = $this->getConnection();
            $table = $this->getMainTable();
            $fromPrefix = $entityType . ':' . $fromEntityId . ':';
            $toPrefix = $entityType . ':' . $toEntityId . ':';

            return (int)$connection->update(
                $table,
                [
                    CommentInterface::ENTITY_ID => $toEntityId,
                    CommentInterface::INSTANCE_KEY => new Expression(
                        sprintf(
                            'REPLACE(%s, %s, %s)',
                            $connection->quoteIdentifier(CommentInterface::INSTANCE_KEY),
                            $connection->quote($fromPrefix),
                            $connection->quote($toPrefix)
                        )
                    ),
                ],
                [
                    CommentInterface::ENTITY_TYPE . ' = ?' => $entityType,
                    CommentInterface::ENTITY_ID . ' = ?' => $fromEntityId,
                ]
            );
        } catch (\Throwable) {
            return 0;
        }
    }
}
