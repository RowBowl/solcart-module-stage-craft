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
use Magento\Framework\Exception\LocalizedException;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\AiGatewayServiceInterface;

class ActivateTrial extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::config';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param AiGatewayServiceInterface $aiGatewayService
     * @param LoggerInterface $logger
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly AiGatewayServiceInterface $aiGatewayService,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    /**
     * Provision and save a 14-day Solcart AI trial key for this store.
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
                    'error' => __('Invalid form key. Please refresh the page and try again.'),
                ]);
            }

            $activation = $this->aiGatewayService->activateTrial();
            return $result->setData($activation);
        } catch (LocalizedException $exception) {
            return $result->setHttpResponseCode(400)->setData([
                'success' => false,
                'error' => $exception->getMessage(),
            ]);
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] ActivateTrial error: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return $result->setHttpResponseCode(500)->setData([
                'success' => false,
                'error' => __('An unexpected error occurred while activating the AI trial.'),
            ]);
        }
    }
}
