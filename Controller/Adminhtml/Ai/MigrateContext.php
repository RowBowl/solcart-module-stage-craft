<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Controller\Adminhtml\Ai;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Solcart\StageCraft\Model\AiGatewayService;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;

class MigrateContext extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param AiGatewayService $aiGatewayService
     * @param CommentResource $commentResource
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly AiGatewayService $aiGatewayService,
        private readonly CommentResource $commentResource
    ) {
        parent::__construct($context);
    }

    /**
     * Migrate stored AI conversation context and pre-save comments from a draft page key
     * (cms_page:new or cms_page:new_<token>) to a newly saved page ID.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();
        if (!$this->formKeyValidator->validate($this->getRequest())) {
            return $result->setHttpResponseCode(400)->setData([
                'success' => false,
                'error' => __('Invalid form key. Please refresh the page and try again.'),
            ]);
        }

        $fromPageKey = trim((string)$this->getRequest()->getParam('from_page_key', ''));
        $toPageKey = trim((string)$this->getRequest()->getParam('to_page_key', ''));
        $pageTitle = trim((string)$this->getRequest()->getParam('page_title', ''));

        $response = $this->aiGatewayService->migrateConversations($fromPageKey, $toPageKey, $pageTitle);
        $migratedComments = $this->migrateDraftComments($fromPageKey, $toPageKey);
        $response['migrated_comments'] = $migratedComments;

        return $result->setData($response);
    }

    /**
     * Idempotently migrate pre-save comments when migrating from a draft key to a persisted entity ID.
     *
     * @param string $fromPageKey
     * @param string $toPageKey
     * @return int
     */
    private function migrateDraftComments(string $fromPageKey, string $toPageKey): int
    {
        if (
            preg_match('/^([a-z0-9_]+):(new(?:_[a-zA-Z0-9_-]{1,64})?)$/', $fromPageKey, $fromMatch)
            && preg_match('/^([a-z0-9_]+):([a-zA-Z0-9_-]+)$/', $toPageKey, $toMatch)
            && $fromMatch[1] === $toMatch[1]
            && $toMatch[2] !== 'new'
            && !str_starts_with($toMatch[2], 'new_')
        ) {
            return $this->commentResource->migrateEntityComments(
                $fromMatch[1],
                $fromMatch[2],
                $toMatch[2]
            );
        }

        return 0;
    }
}
