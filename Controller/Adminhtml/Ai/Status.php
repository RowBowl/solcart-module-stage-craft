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
use Solcart\StageCraft\Api\AiGatewayServiceInterface;

class Status extends Action implements HttpGetActionInterface, HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param AiGatewayServiceInterface $aiGatewayService
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly AiGatewayServiceInterface $aiGatewayService
    ) {
        parent::__construct($context);
    }

    /**
     * Retrieve current Solcart AI license/trial status.
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();
        return $result->setData($this->aiGatewayService->getLicenseStatus());
    }
}
