<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\DeploymentConfig;

class Config
{
    public const XML_PATH_ENABLED = 'solcart_stagecraft/general/enabled';
    public const XML_PATH_ENABLE_PAGE_COMMENTS = 'solcart_stagecraft/general/enable_page_comments';
    public const XML_PATH_ENABLE_FLOATING_PINS = 'solcart_stagecraft/general/enable_floating_pins';
    public const XML_PATH_ENABLED_CONTENT_TYPES = 'solcart_stagecraft/general/enabled_content_types';
    public const XML_PATH_POLLING_INTERVAL = 'solcart_stagecraft/general/polling_interval';

    public const XML_PATH_AI_ENABLED = 'solcart_stagecraft/ai/enabled';
    public const XML_PATH_AI_ENABLE_PAGE_SCAFFOLDER = 'solcart_stagecraft/ai/enable_page_scaffolder';
    public const XML_PATH_AI_ENABLE_STAGE_AI = 'solcart_stagecraft/ai/enable_stage_ai';
    public const XML_PATH_AI_LICENSE_KEY = 'solcart_stagecraft/ai/license_key';
    public const XML_PATH_AI_BRAND_VOICE = 'solcart_stagecraft/ai/brand_voice';
    public const XML_PATH_AI_DISABLED_CONTENT_TYPES = 'solcart_stagecraft/ai/disabled_content_types';
    public const XML_PATH_AI_TIMEOUT = 'solcart_stagecraft/ai/timeout';

    public const DEPLOYMENT_CONFIG_GATEWAY_URL = 'solcart_ai/gateway_url';
    public const DEPLOYMENT_CONFIG_DEMO_MODE = 'solcart_stagecraft/demo_mode';
    public const DEPLOYMENT_CONFIG_AI_DEMO_MODE = 'solcart_ai/demo_mode';
    public const XML_PATH_DEMO_MODE = 'solcart_stagecraft/general/demo_mode';
    public const DEFAULT_GATEWAY_URL = 'https://ai.solcart.dev';

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param DeploymentConfig|null $deploymentConfig
     */
    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly ?DeploymentConfig $deploymentConfig = null
    ) {
    }

    /**
     * Check whether PageBuilder collaboration is enabled.
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED);
    }

    /**
     * Check whether Page-level comments are enabled.
     *
     * @return bool
     */
    public function isPageCommentsEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLE_PAGE_COMMENTS);
    }

    /**
     * Check whether floating comment badges on the PageBuilder stage are enabled.
     *
     * @return bool
     */
    public function isFloatingPinsEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLE_FLOATING_PINS);
    }

    /**
     * Get enabled Page Builder content type identifiers for comments.
     *
     * @return string[]
     */
    public function getEnabledContentTypes(): array
    {
        $raw = (string)$this->scopeConfig->getValue(self::XML_PATH_ENABLED_CONTENT_TYPES);
        if (trim($raw) === '') {
            return ['row'];
        }

        return $this->parseCsvList($raw);
    }

    /**
     * Get background polling interval in seconds.
     *
     * @return int
     */
    public function getPollingInterval(): int
    {
        $interval = (int)$this->scopeConfig->getValue(self::XML_PATH_POLLING_INTERVAL);
        return max(0, $interval);
    }

    /**
     * Check whether the store is running in public Demo Mode (AI features locked with demo banners).
     *
     * Can be enabled in app/etc/env.php via 'solcart_stagecraft' => ['demo_mode' => true]
     * so demo admin users cannot disable it from the Admin UI.
     *
     * @return bool
     */
    public function isDemoMode(): bool
    {
        if ($this->deploymentConfig !== null) {
            try {
                $envFlag = $this->deploymentConfig->get(self::DEPLOYMENT_CONFIG_DEMO_MODE);
                if ($envFlag === null) {
                    $envFlag = $this->deploymentConfig->get(self::DEPLOYMENT_CONFIG_AI_DEMO_MODE);
                }
                if ($envFlag !== null) {
                    return filter_var($envFlag, FILTER_VALIDATE_BOOLEAN);
                }
            } catch (\Throwable) {
                return false;
            }
        }

        return $this->scopeConfig->isSetFlag(self::XML_PATH_DEMO_MODE);
    }

    /**
     * Check whether Solcart AI Assistant (Powered by Solcart AI) is enabled.
     *
     * @return bool
     */
    public function isAiEnabled(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_AI_ENABLED);
    }

    /**
     * Check whether the inline AI Page Scaffolder above Content is enabled.
     *
     * @return bool
     */
    public function isAiPageScaffolderEnabled(): bool
    {
        if (!$this->isAiEnabled()) {
            return false;
        }
        $raw = $this->scopeConfig->getValue(self::XML_PATH_AI_ENABLE_PAGE_SCAFFOLDER);
        return $raw === null || $raw === ''
            ? true
            : $this->scopeConfig->isSetFlag(self::XML_PATH_AI_ENABLE_PAGE_SCAFFOLDER);
    }

    /**
     * Check whether Stage-Level AI features (Row/Column AI buttons and Page Audit) are enabled.
     *
     * @return bool
     */
    public function isAiStageEnabled(): bool
    {
        if (!$this->isAiEnabled()) {
            return false;
        }
        $raw = $this->scopeConfig->getValue(self::XML_PATH_AI_ENABLE_STAGE_AI);
        return $raw === null || $raw === '' ? true : $this->scopeConfig->isSetFlag(self::XML_PATH_AI_ENABLE_STAGE_AI);
    }

    /**
     * Alias for checking whether AI integration in comment threads is enabled.
     *
     * @return bool
     */
    public function isAiIntegrationEnabled(): bool
    {
        return $this->isAiStageEnabled();
    }

    /**
     * Get the merchant's Solcart AI license / workspace key.
     *
     * @return string
     */
    public function getAiLicenseKey(): string
    {
        return trim((string)$this->scopeConfig->getValue(self::XML_PATH_AI_LICENSE_KEY));
    }

    /**
     * Get optional store brand voice guidelines for AI generation.
     *
     * @return string
     */
    public function getAiBrandVoice(): string
    {
        return trim((string)$this->scopeConfig->getValue(self::XML_PATH_AI_BRAND_VOICE));
    }

    /**
     * Get content types excluded from the AI Assistant option.
     *
     * @return string[]
     */
    public function getAiDisabledContentTypes(): array
    {
        $raw = (string)$this->scopeConfig->getValue(self::XML_PATH_AI_DISABLED_CONTENT_TYPES);
        if (trim($raw) === '') {
            return [];
        }

        return $this->parseCsvList($raw);
    }

    /**
     * Get HTTP timeout in seconds for AI Gateway requests.
     *
     * @return int
     */
    public function getAiTimeout(): int
    {
        $timeout = (int)$this->scopeConfig->getValue(self::XML_PATH_AI_TIMEOUT);
        return $timeout > 0 ? max($timeout, 75) : 75;
    }

    /**
     * Resolve the managed Solcart AI Gateway URL (hidden from Admin UI).
     *
     * @return string
     */
    public function getAiGatewayBaseUrl(): string
    {
        if ($this->deploymentConfig !== null) {
            try {
                $configured = trim((string)$this->deploymentConfig->get(self::DEPLOYMENT_CONFIG_GATEWAY_URL, ''));
                if ($configured !== '') {
                    return $configured;
                }
            } catch (\Throwable) {
                return self::DEFAULT_GATEWAY_URL;
            }
        }

        return self::DEFAULT_GATEWAY_URL;
    }

    /**
     * Parse and normalize a comma-separated string of content types.
     *
     * @param string $raw
     * @return string[]
     */
    private function parseCsvList(string $raw): array
    {
        $items = array_map(
            static fn(string $type): string => strtolower(trim($type)),
            explode(',', $raw)
        );
        $items = array_filter($items, static fn(string $type): bool => $type !== '');

        return array_values(array_unique($items));
    }
}
