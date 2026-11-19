<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Block\Adminhtml\System\Config;

use Magento\Backend\Block\Template\Context;
use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;
use Solcart\StageCraft\Model\Config;

class TrialActivation extends Field
{
    /**
     * @var string
     */
    protected $_template = 'Solcart_StageCraft::system/config/trial_activation.phtml';

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
     * Remove scope label for button field.
     *
     * @param AbstractElement $element
     * @return string
     */
    public function render(AbstractElement $element): string
    {
        $element->unsScope()->unsCanUseWebsiteValue()->unsCanUseDefaultValue();
        return parent::render($element);
    }

    /**
     * Return element HTML from template.
     *
     * @param AbstractElement $element
     * @return string
     */
    protected function _getElementHtml(AbstractElement $element): string
    {
        return $this->_toHtml();
    }

    /**
     * Get AJAX URL for activating a 14-day free trial.
     *
     * @return string
     */
    public function getActivateTrialUrl(): string
    {
        return $this->getUrl('solcart_stagecraft/ai/activateTrial');
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
     * Get AJAX URL for loading stored AI conversations and context window usage.
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
     * Check whether a license key is already saved.
     *
     * @return bool
     */
    public function hasSavedLicenseKey(): bool
    {
        return $this->collaborationConfig->getAiLicenseKey() !== '';
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
}
