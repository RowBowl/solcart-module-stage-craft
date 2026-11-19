<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Controller\Adminhtml\Ai;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Solcart\StageCraft\Model\AiGatewayService;

class Conversations extends Action implements HttpGetActionInterface, HttpPostActionInterface
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
     * Fetch stored AI conversations for a page or list all pages for the Context Manager.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();
        $pageKey = trim((string)$this->getRequest()->getParam('page_key', ''));
        $scopeKey = trim((string)$this->getRequest()->getParam('scope_key', ''));

        return $result->setData($this->aiGatewayService->getConversations($pageKey, $scopeKey));
    }
}
