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

class ClearContext extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param AiGatewayService $aiGatewayService
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly AiGatewayService $aiGatewayService
    ) {
        parent::__construct($context);
    }

    /**
     * Clear stored AI conversation history for a scope, page, or entire store domain.
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

        $pageKey = trim((string)$this->getRequest()->getParam('page_key', ''));
        $scopeKey = trim((string)$this->getRequest()->getParam('scope_key', ''));
        $clearAll = (bool)$this->getRequest()->getParam('clear_all', false);

        return $result->setData(
            $this->aiGatewayService->clearConversations($pageKey, $scopeKey, $clearAll)
        );
    }
}
