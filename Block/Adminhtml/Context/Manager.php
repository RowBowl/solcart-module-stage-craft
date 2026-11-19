<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Block\Adminhtml\Context;

use Magento\Backend\Block\Template;
use Magento\Backend\Block\Template\Context;
use Solcart\StageCraft\Model\Config;

class Manager extends Template
{
    /**
     * @param Context $context
     * @param Config $collaborationConfig
     * @param array $data
     */
    public function __construct(
        Context $context,
        private readonly Config $collaborationConfig,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * Check whether the store is running in public Demo Mode.
     *
     * @return bool
     */
    public function isDemoMode(): bool
    {
        return $this->collaborationConfig->isDemoMode();
    }

    /**
     * Get AJAX URL for fetching stored AI conversations from Cloudflare KV.
     *
     * @return string
     */
    public function getConversationsUrl(): string
    {
        return $this->getUrl('solcart_stagecraft/ai/conversations');
    }

    /**
     * Get AJAX URL for clearing stored AI conversation history.
     *
     * @return string
     */
    public function getClearContextUrl(): string
    {
        return $this->getUrl('solcart_stagecraft/ai/clearContext');
    }

    /**
     * Get AJAX URL for checking current license/credit status.
     *
     * @return string
     */
    public function getLicenseStatusUrl(): string
    {
        return $this->getUrl('solcart_stagecraft/ai/status');
    }

    /**
     * Get Admin URL to the CMS Pages grid.
     *
     * @return string
     */
    public function getCmsPagesUrl(): string
    {
        return $this->getUrl('cms/page/index');
    }

    /**
     * Get base Admin URL template for editing a CMS Page by ID.
     *
     * @return string
     */
    public function getCmsPageEditUrlTemplate(): string
    {
        return $this->getUrl('cms/page/edit', ['page_id' => '__ID__']);
    }

    /**
     * Get Admin URL to the StageCraft Configuration section.
     *
     * @return string
     */
    public function getConfigUrl(): string
    {
        return $this->getUrl('adminhtml/system_config/edit', ['section' => 'solcart_stagecraft']);
    }

    /**
     * Get Admin URL to the AI Context Manager main grid screen.
     *
     * @return string
     */
    public function getContextManagerUrl(): string
    {
        return $this->getUrl('solcart_stagecraft/context/index');
    }

    /**
     * Get base Admin URL template for viewing a specific page's AI conversation history.
     *
     * @return string
     */
    public function getPageContextViewUrlTemplate(): string
    {
        return $this->getUrl('solcart_stagecraft/context/view', ['page_key' => '__PAGE_KEY__']);
    }

    /**
     * Get the requested page_key parameter for the detail view.
     *
     * @return string
     */
    public function getRequestedPageKey(): string
    {
        return trim((string)$this->getRequest()->getParam('page_key', ''));
    }

    /**
     * Get AJAX URL for listing, searching, adding, or deleting Self-Learning Storefront Memory rules.
     *
     * @return string
     */
    public function getStoreMemoryUrl(): string
    {
        return $this->getUrl('solcart_stagecraft/ai/storeMemory');
    }
}
