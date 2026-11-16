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
use Magento\Framework\Serialize\Serializer\Json as JsonSerializer;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\AiGatewayServiceInterface;

class Chat extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param AiGatewayServiceInterface $aiGatewayService
     * @param LoggerInterface $logger
     * @param JsonSerializer|null $jsonSerializer
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly AiGatewayServiceInterface $aiGatewayService,
        private readonly LoggerInterface $logger,
        private readonly ?JsonSerializer $jsonSerializer = null
    ) {
        parent::__construct($context);
    }

    /**
     * Execute AI Assistant request through the Solcart AI Gateway.
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

            $prompt = trim((string)$this->getRequest()->getParam('prompt', ''));
            $mode = trim((string)$this->getRequest()->getParam('mode', 'ask'));
            $contextType = trim((string)$this->getRequest()->getParam('context_type', ''));
            $contextContent = trim((string)$this->getRequest()->getParam('context_content', ''));
            $commentThread = $this->extractCommentThread();

            if ($prompt === '') {
                return $result->setHttpResponseCode(400)->setData([
                    'success' => false,
                    'error' => __('Prompt is required.'),
                ]);
            }

            $gatewayResponse = $this->aiGatewayService->generate(
                $prompt,
                $mode,
                $contextType !== '' ? $contextType : null,
                $contextContent !== '' ? $contextContent : null,
                $commentThread
            );

            return $result->setData($gatewayResponse);
        } catch (LocalizedException $exception) {
            return $result->setHttpResponseCode(400)->setData([
                'success' => false,
                'error' => $exception->getMessage(),
            ]);
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] AI Chat controller error: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return $result->setHttpResponseCode(500)->setData([
                'success' => false,
                'error' => __('An unexpected error occurred while processing the AI request.'),
            ]);
        }
    }

    /**
     * Parse optional serialized comment_thread parameter.
     *
     * @return array
     */
    private function extractCommentThread(): array
    {
        $raw = $this->getRequest()->getParam('comment_thread');
        if (is_array($raw)) {
            return $raw;
        }

        if (is_string($raw) && trim($raw) !== '' && $this->jsonSerializer !== null) {
            try {
                $decoded = $this->jsonSerializer->unserialize($raw);
                return is_array($decoded) ? $decoded : [];
            } catch (\Throwable) {
                return [];
            }
        }

        return [];
    }
}
