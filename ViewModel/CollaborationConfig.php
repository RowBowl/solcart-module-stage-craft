<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\ViewModel;

use Magento\Backend\Model\Auth\Session as AuthSession;
use Magento\Backend\Model\UrlInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\AuthorizationInterface;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Solcart\StageCraft\Model\Config;

class CollaborationConfig implements ArgumentInterface
{
    /**
     * @param Config $config
     * @param UrlInterface $backendUrl
     * @param RequestInterface $request
     * @param AuthSession $authSession
     * @param AuthorizationInterface $authorization
     * @param FormKey $formKey
     * @param Json $jsonSerializer
     */
    public function __construct(
        private readonly Config $config,
        private readonly UrlInterface $backendUrl,
        private readonly RequestInterface $request,
        private readonly AuthSession $authSession,
        private readonly AuthorizationInterface $authorization,
        private readonly FormKey $formKey,
        private readonly Json $jsonSerializer
    ) {
    }

    /**
     * Build serialized configuration for the PageBuilder Collaboration & AI frontend module.
     *
     * @return string
     */
    public function getConfigJson(): string
    {
        [$entityType, $entityId] = $this->resolveEntityContext();
        $user = $this->authSession->getUser();
        $username = $user ? (string)$user->getUserName() : 'admin';
        $fullName = $user
            ? trim((string)$user->getFirstName() . ' ' . (string)$user->getLastName())
            : '';

        $demoMode = $this->config->isDemoMode();
        $aiAllowed = $this->authorization->isAllowed('Solcart_StageCraft::ai');
        $aiEnabled = !$demoMode && $this->config->isAiEnabled() && $aiAllowed;
        $aiPageScaffolderEnabled = !$demoMode && $this->config->isAiPageScaffolderEnabled() && $aiAllowed;
        $aiStageEnabled = !$demoMode && $this->config->isAiStageEnabled() && $aiAllowed;

        return $this->jsonSerializer->serialize([
            'enabled' => $this->config->isEnabled()
                && $this->authorization->isAllowed('Solcart_StageCraft::view'),
            'demoMode' => $demoMode,
            'enablePageComments' => $this->config->isPageCommentsEnabled(),
            'enableFloatingPins' => $this->config->isFloatingPinsEnabled(),
            'enabledContentTypes' => ['row', 'column-group', 'column'],
            'aiIntegrationEnabled' => $aiStageEnabled,
            'ai' => [
                'enabled' => $aiEnabled,
                'demoMode' => $demoMode,
                'enablePageScaffolder' => $aiPageScaffolderEnabled,
                'enableStageAi' => $aiStageEnabled,
                'disabledContentTypes' => [],
                'hasLicenseKey' => $this->config->getAiLicenseKey() !== '',
            ],
            'pollingInterval' => $this->config->getPollingInterval(),
            'entityType' => $entityType,
            'entityId' => $entityId,
            'formKey' => $this->formKey->getFormKey(),
            'currentUser' => [
                'user_id' => $user && $user->getId() ? (int)$user->getId() : null,
                'username' => $username,
                'name' => $fullName !== '' ? $fullName : $username,
            ],
            'permissions' => [
                'view' => $this->authorization->isAllowed('Solcart_StageCraft::view'),
                'comment' => $this->authorization->isAllowed('Solcart_StageCraft::comment'),
                'resolve' => $this->authorization->isAllowed('Solcart_StageCraft::resolve'),
                'ai' => $aiAllowed,
                'delete' => $this->authorization->isAllowed('Solcart_StageCraft::delete'),
            ],
            'urls' => [
                'list' => $this->backendUrl->getUrl('solcart_stagecraft/comment/index'),
                'save' => $this->backendUrl->getUrl('solcart_stagecraft/comment/save'),
                'status' => $this->backendUrl->getUrl('solcart_stagecraft/comment/status'),
                'delete' => $this->backendUrl->getUrl('solcart_stagecraft/comment/delete'),
                'aiChat' => $this->backendUrl->getUrl('solcart_stagecraft/ai/chat'),
                'aiAudit' => $this->backendUrl->getUrl('solcart_stagecraft/ai/audit'),
                'aiActivateTrial' => $this->backendUrl->getUrl('solcart_stagecraft/ai/activateTrial'),
                'aiStatus' => $this->backendUrl->getUrl('solcart_stagecraft/ai/status'),
                'aiConversations' => $this->backendUrl->getUrl('solcart_stagecraft/ai/conversations'),
                'aiClearContext' => $this->backendUrl->getUrl('solcart_stagecraft/ai/clearContext'),
                'aiContextManager' => $this->backendUrl->getUrl('solcart_stagecraft/context/index'),
            ],
        ]);
    }

    /**
     * Resolve current Admin entity type and entity ID from request action and parameters.
     *
     * @return string[]
     */
    private function resolveEntityContext(): array
    {
        $fullActionName = strtolower((string)$this->request->getFullActionName());

        if (str_contains($fullActionName, 'cms_page')) {
            return ['cms_page', (string)($this->request->getParam('page_id') ?: 'new')];
        }

        if (str_contains($fullActionName, 'cms_block')) {
            return ['cms_block', (string)($this->request->getParam('block_id') ?: 'new')];
        }

        if (str_contains($fullActionName, 'catalog_product')) {
            return ['catalog_product', (string)($this->request->getParam('id') ?: 'new')];
        }

        if (str_contains($fullActionName, 'catalog_category')) {
            return ['catalog_category', (string)($this->request->getParam('id') ?: 'new')];
        }

        $entityId = (string)(
            $this->request->getParam('page_id')
            ?: $this->request->getParam('block_id')
            ?: $this->request->getParam('id')
            ?: 'global'
        );

        return [$fullActionName !== '' ? $fullActionName : 'cms_page', $entityId];
    }

    /**
     * Check whether the store is running in public Demo Mode.
     *
     * @return bool
     */
    public function isDemoMode(): bool
    {
        return $this->config->isDemoMode();
    }

    /**
     * Get Admin URL to the CMS Pages grid for demo navigation.
     *
     * @return string
     */
    public function getCmsPagesUrl(): string
    {
        return $this->backendUrl->getUrl('cms/page/index');
    }

    /**
     * Get Admin URL to the StageCraft Configuration section.
     *
     * @return string
     */
    public function getStageCraftConfigUrl(): string
    {
        return $this->backendUrl->getUrl('adminhtml/system_config/edit', ['section' => 'solcart_stagecraft']);
    }
}
