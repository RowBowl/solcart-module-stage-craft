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

class StoreMemory extends Action implements HttpGetActionInterface, HttpPostActionInterface
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
     * List, search, add, or delete Self-Learning Storefront Memory rules.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();
        $request = $this->getRequest();

        if ($request->isPost()) {
            $action = trim((string)$request->getParam('memory_action', 'add'));
            $category = trim((string)$request->getParam('category', 'brand_rule'));
            $rule = trim((string)$request->getParam('rule', ''));
            $memoryId = trim((string)$request->getParam('id', ''));
            $clearAll = (bool)$request->getParam('clear_all', false);

            return $result->setData(
                $this->aiGatewayService->updateStorefrontMemory($action, $category, $rule, $memoryId, $clearAll)
            );
        }

        $query = trim((string)$request->getParam('q', ''));
        return $result->setData($this->aiGatewayService->getStorefrontMemory($query));
    }
}
