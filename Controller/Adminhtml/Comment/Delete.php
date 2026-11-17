<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Controller\Adminhtml\Comment;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Exception\LocalizedException;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\CollaborationManagementInterface;

class Delete extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::delete';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param CollaborationManagementInterface $collaborationManagement
     * @param LoggerInterface $logger
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly CollaborationManagementInterface $collaborationManagement,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    /**
     * Delete a collaborative comment or reply.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();

        try {
            if (!$this->formKeyValidator->validate($this->getRequest())) {
                return $result->setHttpResponseCode(400)->setData([
                    'success' => false,
                    'message' => __('Invalid form key. Please refresh the page and try again.'),
                ]);
            }

            $commentId = (int)$this->getRequest()->getParam('comment_id', 0);
            if ($commentId <= 0) {
                return $result->setHttpResponseCode(400)->setData([
                    'success' => false,
                    'message' => __('Valid comment ID is required.'),
                ]);
            }

            $data = $this->collaborationManagement->deleteComment($commentId);
            $requestedKey = trim((string)$this->getRequest()->getParam('instance_key', ''));
            if (str_contains($requestedKey, '#demo_')) {
                $data = $this->collaborationManagement->getThreadPayload($requestedKey);
            }

            return $result->setData([
                'success' => true,
                'data' => $data,
            ]);
        } catch (LocalizedException $exception) {
            return $result->setHttpResponseCode(400)->setData([
                'success' => false,
                'message' => $exception->getMessage(),
            ]);
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] Failed deleting comment: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return $result->setHttpResponseCode(500)->setData([
                'success' => false,
                'message' => __('Unable to delete comment.'),
            ]);
        }
    }
}
