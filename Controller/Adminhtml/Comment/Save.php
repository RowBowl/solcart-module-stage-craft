<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Controller\Adminhtml\Comment;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Backend\Model\Auth\Session as AuthSession;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Exception\LocalizedException;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\CollaborationManagementInterface;

class Save extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::comment';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param CollaborationManagementInterface $collaborationManagement
     * @param AuthSession $authSession
     * @param LoggerInterface $logger
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly CollaborationManagementInterface $collaborationManagement,
        private readonly AuthSession $authSession,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    /**
     * Save a new PageBuilder collaborative comment or threaded reply.
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

            $user = $this->authSession->getUser();
            $adminUserId = $user && $user->getId() ? (int)$user->getId() : null;
            $authorUsername = $user ? (string)$user->getUserName() : 'admin';
            $authorName = $user
                ? trim((string)$user->getFirstName() . ' ' . (string)$user->getLastName())
                : '';
            if ($authorName === '') {
                $authorName = $authorUsername ?: 'Admin User';
            }

            $params = $this->getRequest()->getParams();
            $data = $this->collaborationManagement->createComment(
                $params,
                $adminUserId,
                $authorName,
                $authorUsername
            );

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
                '[Solcart_StageCraft] Failed saving comment: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return $result->setHttpResponseCode(500)->setData([
                'success' => false,
                'message' => __('An error occurred while saving the comment.'),
            ]);
        }
    }
}
