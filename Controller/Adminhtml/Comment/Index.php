<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Controller\Adminhtml\Comment;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\CollaborationManagementInterface;

class Index extends Action implements HttpGetActionInterface, HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::view';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param CollaborationManagementInterface $collaborationManagement
     * @param LoggerInterface $logger
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly CollaborationManagementInterface $collaborationManagement,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    /**
     * Load collaborative comments and mentionable admin users for a PageBuilder instance.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();

        try {
            $instanceKey = trim((string)$this->getRequest()->getParam('instance_key', ''));
            $includeUsers = (bool)$this->getRequest()->getParam('include_users', false);

            $payload = $this->collaborationManagement->getThreadPayload($instanceKey);
            $responseData = [
                'success' => true,
                'data' => $payload,
            ];

            if ($includeUsers) {
                $responseData['users'] = $this->collaborationManagement->getMentionableAdminUsers();
            }

            return $result->setData($responseData);
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] Failed loading comments: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return $result->setHttpResponseCode(500)->setData([
                'success' => false,
                'message' => __('Unable to load collaborative comments.'),
            ]);
        }
    }
}
