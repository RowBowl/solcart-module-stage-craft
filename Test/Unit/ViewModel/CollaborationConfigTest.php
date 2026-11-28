<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\ViewModel;

use Magento\Backend\Model\Auth\Session as AuthSession;
use Magento\Backend\Model\UrlInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\AuthorizationInterface;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\Serialize\Serializer\Json;
use PHPUnit\Framework\TestCase;
use Solcart\StageCraft\Model\Config;
use Solcart\StageCraft\ViewModel\CollaborationConfig;

class CollaborationConfigTest extends TestCase
{
    public function testGetConfigJsonUsesConfiguredEnabledAndDisabledContentTypes(): void
    {
        $configMock = $this->createMock(Config::class);
        $configMock->method('isEnabled')->willReturn(true);
        $configMock->method('isDemoMode')->willReturn(false);
        $configMock->method('isPageCommentsEnabled')->willReturn(true);
        $configMock->method('isFloatingPinsEnabled')->willReturn(true);
        $configMock->expects($this->once())
            ->method('getEnabledContentTypes')
            ->willReturn(['row', 'column', 'banner']);
        $configMock->method('isAiEnabled')->willReturn(true);
        $configMock->method('isAiPageScaffolderEnabled')->willReturn(true);
        $configMock->method('isAiStageEnabled')->willReturn(true);
        $configMock->expects($this->once())
            ->method('getAiDisabledContentTypes')
            ->willReturn(['html', 'divider']);
        $configMock->method('getAiLicenseKey')->willReturn('lic_test_123');
        $configMock->method('getPollingInterval')->willReturn(0);

        $backendUrlMock = $this->createMock(UrlInterface::class);
        $backendUrlMock->method('getUrl')->willReturnCallback(
            static fn(string $route): string => 'https://magento2.docker/admin/' . $route
        );

        $requestMock = $this->createMock(HttpRequest::class);
        $requestMock->method('getFullActionName')->willReturn('cms_page_edit');
        $requestMock->method('getParam')->with('page_id')->willReturn('14');

        $authSessionMock = $this->getMockBuilder(AuthSession::class)
            ->disableOriginalConstructor()
            ->addMethods(['getUser'])
            ->getMock();
        $authSessionMock->method('getUser')->willReturn(null);

        $authorizationMock = $this->createMock(AuthorizationInterface::class);
        $authorizationMock->method('isAllowed')->willReturn(true);

        $formKeyMock = $this->createMock(FormKey::class);
        $formKeyMock->method('getFormKey')->willReturn('test_form_key');

        $jsonSerializer = new Json();

        $viewModel = new CollaborationConfig(
            $configMock,
            $backendUrlMock,
            $requestMock,
            $authSessionMock,
            $authorizationMock,
            $formKeyMock,
            $jsonSerializer
        );

        $decoded = $jsonSerializer->unserialize($viewModel->getConfigJson());

        $this->assertSame(['row', 'column', 'banner'], $decoded['enabledContentTypes']);
        $this->assertSame(['html', 'divider'], $decoded['ai']['disabledContentTypes']);
        $this->assertSame('cms_page', $decoded['entityType']);
        $this->assertSame('14', $decoded['entityId']);
        $this->assertSame('test_form_key', $decoded['formKey']);
    }
}
