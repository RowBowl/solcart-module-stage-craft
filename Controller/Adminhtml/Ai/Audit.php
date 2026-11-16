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
use Solcart\StageCraft\Api\CollaborationManagementInterface;

class Audit extends Action implements HttpPostActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param JsonFactory $resultJsonFactory
     * @param FormKeyValidator $formKeyValidator
     * @param AiGatewayServiceInterface $aiGatewayService
     * @param CollaborationManagementInterface $collaborationManagement
     * @param JsonSerializer $jsonSerializer
     * @param LoggerInterface $logger
     */
    public function __construct(
        Context $context,
        private readonly JsonFactory $resultJsonFactory,
        private readonly FormKeyValidator $formKeyValidator,
        private readonly AiGatewayServiceInterface $aiGatewayService,
        private readonly CollaborationManagementInterface $collaborationManagement,
        private readonly JsonSerializer $jsonSerializer,
        private readonly LoggerInterface $logger
    ) {
        parent::__construct($context);
    }

    /**
     * Run an AI Page Audit and post @AI-Reviewer comment threads anchored to stage Rows.
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

            $instanceKey = trim((string)$this->getRequest()->getParam('instance_key', ''));
            $entityType = trim((string)$this->getRequest()->getParam('entity_type', 'cms_page')) ?: 'cms_page';
            $entityId = trim((string)$this->getRequest()->getParam('entity_id', 'new')) ?: 'new';
            $fieldName = trim((string)$this->getRequest()->getParam('field_name', 'content')) ?: 'content';
            $pageTitle = trim((string)$this->getRequest()->getParam('page_title', ''));
            $rows = $this->extractRowsParam();

            if ($instanceKey === '' || empty($rows)) {
                return $result->setHttpResponseCode(400)->setData([
                    'success' => false,
                    'error' => __('PageBuilder stage rows are required to run an AI Page Audit.'),
                ]);
            }

            $auditResponse = $this->aiGatewayService->auditPage($rows, $pageTitle !== '' ? $pageTitle : null);

            if (($auditResponse['payment_required'] ?? false) === true) {
                return $result->setData($auditResponse);
            }

            if (empty($auditResponse['success'])) {
                return $result->setData($auditResponse);
            }

            $items = is_array($auditResponse['items'] ?? null) ? $auditResponse['items'] : [];
            $createdCount = 0;

            foreach ($items as $item) {
                $commentText = trim((string)($item['comment_text'] ?? ''));
                if ($commentText === '') {
                    continue;
                }

                $this->collaborationManagement->createComment(
                    [
                        'instance_key' => $instanceKey,
                        'entity_type' => $entityType,
                        'entity_id' => $entityId,
                        'field_name' => $fieldName,
                        'target_type' => (string)($item['target_type'] ?? 'row'),
                        'target_id' => (string)($item['target_id'] ?? 'page'),
                        'structural_path' => (string)($item['structural_path'] ?? 'row:0'),
                        'target_label' => (string)($item['target_label'] ?? 'Row #1'),
                        'comment_text' => $commentText,
                    ],
                    null,
                    'Solcart AI Reviewer',
                    'AI-Reviewer'
                );
                $createdCount++;
            }

            $threadPayload = $this->collaborationManagement->getThreadPayload($instanceKey);

            return $result->setData([
                'success' => true,
                'created_count' => $createdCount,
                'items' => $items,
                'data' => $threadPayload,
                'usage' => is_array($auditResponse['usage'] ?? null) ? $auditResponse['usage'] : [],
            ]);
        } catch (LocalizedException $exception) {
            return $result->setHttpResponseCode(400)->setData([
                'success' => false,
                'error' => $exception->getMessage(),
            ]);
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] AI Audit controller error: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return $result->setHttpResponseCode(500)->setData([
                'success' => false,
                'error' => __('An unexpected error occurred while running the AI Page Audit.'),
            ]);
        }
    }

    /**
     * Extract array of rows from request parameters.
     *
     * @return array
     */
    private function extractRowsParam(): array
    {
        $raw = $this->getRequest()->getParam('rows');
        if (is_array($raw)) {
            return $raw;
        }

        if (is_string($raw) && trim($raw) !== '') {
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
