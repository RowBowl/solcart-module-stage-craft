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
use Solcart\StageCraft\Model\AiGatewayService;

class MigrateContext extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param AiGatewayService $aiGatewayService
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly AiGatewayService $aiGatewayService
    ) {
        parent::__construct($context);
    }

    /**
     * Migrate stored AI conversation context from a draft page key (cms_page:new) to a newly saved page ID.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();
        $fromPageKey = trim((string)$this->getRequest()->getParam('from_page_key', ''));
        $toPageKey = trim((string)$this->getRequest()->getParam('to_page_key', ''));
        $pageTitle = trim((string)$this->getRequest()->getParam('page_title', ''));

        return $result->setData(
            $this->aiGatewayService->migrateConversations($fromPageKey, $toPageKey, $pageTitle)
        );
    }
}
