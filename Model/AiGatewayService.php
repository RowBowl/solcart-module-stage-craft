<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model;

use Magento\Framework\App\Cache\TypeListInterface;
use Magento\Framework\App\Config\Storage\WriterInterface;
use Magento\Framework\Encryption\EncryptorInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\HTTP\Client\CurlFactory;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\AiGatewayServiceInterface;

class AiGatewayService implements AiGatewayServiceInterface
{
    /**
     * @param CurlFactory $curlFactory
     * @param Config $config
     * @param StoreManagerInterface $storeManager
     * @param Json $jsonSerializer
     * @param LoggerInterface $logger
     * @param WriterInterface|null $configWriter
     * @param EncryptorInterface|null $encryptor
     * @param TypeListInterface|null $cacheTypeList
     */
    public function __construct(
        private readonly CurlFactory $curlFactory,
        private readonly Config $config,
        private readonly StoreManagerInterface $storeManager,
        private readonly Json $jsonSerializer,
        private readonly LoggerInterface $logger,
        private readonly ?WriterInterface $configWriter = null,
        private readonly ?EncryptorInterface $encryptor = null,
        private readonly ?TypeListInterface $cacheTypeList = null
    ) {
    }

    /**
     * @inheritdoc
     */
    public function generate(
        string $prompt,
        string $mode = 'ask',
        ?string $contextType = null,
        ?string $contextContent = null,
        array $commentThread = [],
        array $conversationHistory = [],
        string $pageKey = '',
        string $pageTitle = '',
        string $scopeKey = '',
        string $scopeLabel = ''
    ): array {
        if ($this->config->isDemoMode()) {
            throw new LocalizedException(
                __('AI Features Disabled For Demo — Install Solcart StageCraft on your store to use Solcart AI.')
            );
        }

        if (!$this->config->isAiEnabled()) {
            throw new LocalizedException(__('Solcart AI Assistant is disabled in configuration.'));
        }

        $trimmedPrompt = trim($prompt);
        if ($trimmedPrompt === '') {
            throw new LocalizedException(__('Prompt cannot be empty.'));
        }

        $rawMode = strtolower(trim($mode));
        $normalizedMode = in_array($rawMode, ['auto', 'layout', 'build', 'ask'], true) ? $rawMode : 'auto';
        $endpoint = rtrim($this->config->getAiGatewayBaseUrl(), '/') . '/v1/ai/generate';

        $payload = [
            'mode' => $normalizedMode,
            'prompt' => $trimmedPrompt,
            'context_type' => $contextType !== null ? trim($contextType) : '',
            'context_content' => $contextContent !== null ? trim($contextContent) : '',
            'brand_voice' => $this->config->getAiBrandVoice(),
            'comment_thread' => array_values($commentThread),
            'conversation_history' => array_values($conversationHistory),
            'page_key' => trim($pageKey),
            'page_title' => trim($pageTitle),
            'scope_key' => trim($scopeKey),
            'scope_label' => trim($scopeLabel),
        ];

        try {
            $curl = $this->curlFactory->create();
            $curl->setTimeout($this->config->getAiTimeout());
            $curl->setHeaders($this->buildRequestHeaders());
            $curl->post($endpoint, $this->jsonSerializer->serialize($payload));

            $statusCode = (int)$curl->getStatus();
            $rawBody = (string)$curl->getBody();
            $decoded = $this->decodeJsonSafely($rawBody);

            if ($statusCode === 402 || ($decoded['payment_required'] ?? false) === true) {
                return [
                    'success' => false,
                    'payment_required' => true,
                    'response' => '',
                    'error' => (string)($decoded['error'] ?? $decoded['message'] ?? __(
                        'Your AI trial or monthly credit allowance has been reached. Please upgrade your plan.'
                    )),
                    'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [],
                ];
            }

            if ($statusCode < 200 || $statusCode >= 300) {
                $errorMsg = (string)($decoded['error'] ?? $decoded['message'] ?? (
                    'Cloud AI Gateway returned HTTP ' . $statusCode
                ));

                return [
                    'success' => false,
                    'response' => '',
                    'error' => $errorMsg,
                    'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [],
                ];
            }

            $responseText = (string)($decoded['response'] ?? '');
            if ($responseText === '' && isset($decoded['choices'][0]['message']['content'])) {
                $responseText = (string)$decoded['choices'][0]['message']['content'];
            }

            return [
                'success' => (bool)($decoded['success'] ?? true),
                'mode' => (string)($decoded['mode'] ?? $normalizedMode),
                'decision' => is_array($decoded['decision'] ?? null) ? $decoded['decision'] : null,
                'response' => $responseText,
                'blueprint' => is_array($decoded['blueprint'] ?? null) ? $decoded['blueprint'] : null,
                'context_stats' => is_array($decoded['context_stats'] ?? null) ? $decoded['context_stats'] : null,
                'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [
                    'plan' => 'starter',
                    'status' => 'active',
                ],
            ];
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] Cloud AI Gateway request failed: ' . $exception->getMessage(),
                ['endpoint' => $endpoint]
            );

            return [
                'success' => false,
                'response' => '',
                'error' => (string)__(
                    'Unable to reach Solcart AI Gateway (%1). Verify the Worker is running.',
                    $exception->getMessage()
                ),
            ];
        }
    }

    /**
     * @inheritdoc
     */
    public function auditPage(array $rows, ?string $pageTitle = null): array
    {
        if ($this->config->isDemoMode()) {
            throw new LocalizedException(
                __('AI Features Disabled For Demo — Install Solcart StageCraft on your store to use Solcart AI.')
            );
        }

        if (!$this->config->isAiEnabled()) {
            throw new LocalizedException(__('Solcart AI Assistant is disabled in configuration.'));
        }

        if (empty($rows)) {
            throw new LocalizedException(__('At least one Page Builder row or block is required for an AI audit.'));
        }

        $endpoint = rtrim($this->config->getAiGatewayBaseUrl(), '/') . '/v1/ai/audit';
        $payload = [
            'rows' => array_values($rows),
            'page_title' => $pageTitle !== null ? trim($pageTitle) : '',
            'brand_voice' => $this->config->getAiBrandVoice(),
        ];

        try {
            $curl = $this->curlFactory->create();
            $curl->setTimeout($this->config->getAiTimeout());
            $curl->setHeaders($this->buildRequestHeaders());
            $curl->post($endpoint, $this->jsonSerializer->serialize($payload));

            $statusCode = (int)$curl->getStatus();
            $decoded = $this->decodeJsonSafely((string)$curl->getBody());

            if ($statusCode === 402 || ($decoded['payment_required'] ?? false) === true) {
                return [
                    'success' => false,
                    'payment_required' => true,
                    'items' => [],
                    'error' => (string)($decoded['error'] ?? __(
                        'Your AI trial or monthly credit allowance has been reached. Please upgrade your plan.'
                    )),
                    'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [],
                ];
            }

            if ($statusCode < 200 || $statusCode >= 300) {
                return [
                    'success' => false,
                    'items' => [],
                    'error' => (string)($decoded['error'] ?? ('Cloud AI Gateway returned HTTP ' . $statusCode)),
                    'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [],
                ];
            }

            return [
                'success' => (bool)($decoded['success'] ?? true),
                'items' => is_array($decoded['items'] ?? null) ? $decoded['items'] : [],
                'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [],
            ];
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] Cloud AI Audit failed: ' . $exception->getMessage(),
                ['endpoint' => $endpoint]
            );

            return [
                'success' => false,
                'items' => [],
                'error' => (string)__(
                    'Unable to reach Solcart AI Gateway (%1).',
                    $exception->getMessage()
                ),
            ];
        }
    }

    /**
     * @inheritdoc
     */
    public function activateTrial(): array
    {
        if ($this->config->isDemoMode()) {
            throw new LocalizedException(
                __('AI Features Disabled For Demo — Trial provisioning is disabled on this public demo site.')
            );
        }

        $endpoint = rtrim($this->config->getAiGatewayBaseUrl(), '/') . '/v1/license/activate-trial';
        $domain = $this->resolveStoreDomain();

        try {
            $curl = $this->curlFactory->create();
            $curl->setTimeout(15);
            $curl->setHeaders($this->buildRequestHeaders());
            $curl->post($endpoint, $this->jsonSerializer->serialize(['domain' => $domain]));

            $statusCode = (int)$curl->getStatus();
            $decoded = $this->decodeJsonSafely((string)$curl->getBody());

            if ($statusCode < 200 || $statusCode >= 300 || empty($decoded['license_key'])) {
                throw new LocalizedException(__(
                    (string)($decoded['error'] ?? 'Unable to provision trial license key from Solcart AI.')
                ));
            }

            $licenseKey = trim((string)$decoded['license_key']);
            $this->persistLicenseKey($licenseKey);

            return [
                'success' => true,
                'license_key' => $licenseKey,
                'domain' => $domain,
                'usage' => is_array($decoded['usage'] ?? null) ? $decoded['usage'] : [],
            ];
        } catch (LocalizedException $exception) {
            throw $exception;
        } catch (\Throwable $exception) {
            $this->logger->error(
                '[Solcart_StageCraft] Trial activation failed: ' . $exception->getMessage(),
                ['endpoint' => $endpoint]
            );
            throw new LocalizedException(
                __('Failed to activate trial: %1', $exception->getMessage())
            );
        }
    }

    /**
     * @inheritdoc
     */
    public function getLicenseStatus(): array
    {
        if ($this->config->isDemoMode()) {
            return [
                'success' => false,
                'enabled' => false,
                'demo_mode' => true,
                'status' => [
                    'plan' => 'demo',
                    'gateway_reachable' => false,
                ],
            ];
        }

        if (!$this->config->isAiEnabled()) {
            return [
                'success' => false,
                'enabled' => false,
            ];
        }

        $endpoint = rtrim($this->config->getAiGatewayBaseUrl(), '/') . '/v1/license/status';

        try {
            $curl = $this->curlFactory->create();
            $curl->setTimeout(10);
            $curl->setHeaders($this->buildRequestHeaders());
            $curl->get($endpoint);

            $statusCode = (int)$curl->getStatus();
            $decoded = $this->decodeJsonSafely((string)$curl->getBody());

            if ($statusCode >= 200 && $statusCode < 300 && !empty($decoded)) {
                return [
                    'success' => true,
                    'status' => $decoded,
                ];
            }

            return [
                'success' => false,
                'status' => [
                    'plan' => 'trial',
                    'gateway_reachable' => false,
                ],
            ];
        } catch (\Throwable) {
            return [
                'success' => false,
                'status' => [
                    'plan' => 'starter',
                    'gateway_reachable' => false,
                ],
            ];
        }
    }

    /**
     * Fetch stored AI conversation history and context window usage from Cloudflare KV.
     *
     * @param string $pageKey
     * @param string $scopeKey
     * @return array
     */
    public function getConversations(string $pageKey = '', string $scopeKey = ''): array
    {
        if ($this->config->isDemoMode() || !$this->config->isAiEnabled()) {
            return [
                'success' => false,
                'pages' => [],
            ];
        }

        $query = [];
        if (trim($pageKey) !== '') {
            $query['page_key'] = trim($pageKey);
        }
        if (trim($scopeKey) !== '') {
            $query['scope_key'] = trim($scopeKey);
        }
        $qs = !empty($query) ? ('?' . http_build_query($query)) : '';
        $endpoint = rtrim($this->config->getAiGatewayBaseUrl(), '/') . '/v1/ai/conversations' . $qs;

        try {
            $curl = $this->curlFactory->create();
            $curl->setTimeout(10);
            $curl->setHeaders($this->buildRequestHeaders());
            $curl->get($endpoint);

            $statusCode = (int)$curl->getStatus();
            $decoded = $this->decodeJsonSafely((string)$curl->getBody());
            if ($statusCode >= 200 && $statusCode < 300 && !empty($decoded)) {
                return $decoded;
            }
        } catch (\Throwable) {
            return [
                'success' => false,
                'pages' => [],
            ];
        }

        return [
            'success' => false,
            'pages' => [],
        ];
    }

    /**
     * Clear stored AI conversation history for a scope, page, or entire store domain in Cloudflare KV.
     *
     * @param string $pageKey
     * @param string $scopeKey
     * @param bool $clearAll
     * @return array
     */
    public function clearConversations(string $pageKey = '', string $scopeKey = '', bool $clearAll = false): array
    {
        if ($this->config->isDemoMode() || !$this->config->isAiEnabled()) {
            return [
                'success' => false,
                'pages' => [],
            ];
        }

        $endpoint = rtrim($this->config->getAiGatewayBaseUrl(), '/') . '/v1/ai/conversations/clear';
        $payload = [
            'page_key' => trim($pageKey),
            'scope_key' => trim($scopeKey),
            'clear_all' => $clearAll,
        ];

        try {
            $curl = $this->curlFactory->create();
            $curl->setTimeout(10);
            $curl->setHeaders($this->buildRequestHeaders());
            $curl->post($endpoint, $this->jsonSerializer->serialize($payload));

            $statusCode = (int)$curl->getStatus();
            $decoded = $this->decodeJsonSafely((string)$curl->getBody());
            if ($statusCode >= 200 && $statusCode < 300 && !empty($decoded)) {
                return $decoded;
            }
        } catch (\Throwable) {
            return [
                'success' => false,
                'pages' => [],
            ];
        }

        return [
            'success' => false,
            'pages' => [],
        ];
    }

    /**
     * Persist activated license key to Magento system configuration.
     *
     * @param string $licenseKey
     * @return void
     */
    private function persistLicenseKey(string $licenseKey): void
    {
        if ($this->configWriter === null || $licenseKey === '') {
            return;
        }

        $valueToSave = $this->encryptor !== null
            ? $this->encryptor->encrypt($licenseKey)
            : $licenseKey;

        $this->configWriter->save(Config::XML_PATH_AI_LICENSE_KEY, $valueToSave);
        $this->configWriter->save(Config::XML_PATH_AI_ENABLED, '1');

        if ($this->cacheTypeList !== null) {
            $this->cacheTypeList->cleanType('config');
        }
    }

    /**
     * Resolve current Magento storefront host/domain.
     *
     * @return string
     */
    private function resolveStoreDomain(): string
    {
        try {
            $baseUrl = (string)$this->storeManager->getStore()->getBaseUrl();
            $extracted = preg_replace('#^https?://([^/:]+).*$#i', '$1', trim($baseUrl));
            if (is_string($extracted) && $extracted !== '') {
                return $extracted;
            }
        } catch (\Throwable) {
            return 'localhost';
        }

        return 'localhost';
    }

    /**
     * Build standard headers for authenticating with the Solcart AI Worker.
     *
     * @return array
     */
    private function buildRequestHeaders(): array
    {
        $licenseKey = trim($this->config->getAiLicenseKey());
        if ($licenseKey === '') {
            $licenseKey = 'slc_trial_auto';
        }

        return [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $licenseKey,
            'X-Magento-Domain' => $this->resolveStoreDomain(),
        ];
    }

    /**
     * Decode JSON string without throwing on non-JSON responses.
     *
     * @param string $rawBody
     * @return array
     */
    private function decodeJsonSafely(string $rawBody): array
    {
        if (trim($rawBody) === '') {
            return [];
        }

        try {
            $decoded = $this->jsonSerializer->unserialize($rawBody);
            return is_array($decoded) ? $decoded : [];
        } catch (\Throwable) {
            return [];
        }
    }
}
