<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Controller\Adminhtml\Ai;

use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Solcart\StageCraft\Controller\Adminhtml\Ai\StoreMemory;
use Solcart\StageCraft\Model\AiGatewayService;

class StoreMemoryTest extends TestCase
{
    private MockObject $requestMock;
    private MockObject $jsonFactoryMock;
    private MockObject $formKeyValidatorMock;
    private MockObject $aiGatewayServiceMock;
    private StoreMemory $controller;

    protected function setUp(): void
    {
        $this->requestMock = $this->createMock(HttpRequest::class);
        $contextMock = $this->createConfiguredMock(Context::class, [
            'getRequest' => $this->requestMock,
        ]);

        $this->jsonFactoryMock = $this->createMock(JsonFactory::class);
        $this->formKeyValidatorMock = $this->createMock(FormKeyValidator::class);
        $this->aiGatewayServiceMock = $this->createMock(AiGatewayService::class);

        $this->controller = new StoreMemory(
            $contextMock,
            $this->jsonFactoryMock,
            $this->formKeyValidatorMock,
            $this->aiGatewayServiceMock
        );
    }

    public function testExecutePostReturns400WhenFormKeyIsInvalid(): void
    {
        $jsonResultMock = $this->createMock(Json::class);
        $jsonResultMock->expects($this->once())->method('setHttpResponseCode')->with(400)->willReturnSelf();
        $jsonResultMock->expects($this->once())->method('setData')->with($this->callback(
            static fn(array $data): bool => $data['success'] === false
        ))->willReturnSelf();

        $this->jsonFactoryMock->expects($this->once())->method('create')->willReturn($jsonResultMock);
        $this->requestMock->method('isPost')->willReturn(true);
        $this->formKeyValidatorMock
            ->expects($this->once())
            ->method('validate')
            ->with($this->requestMock)
            ->willReturn(false);
        $this->aiGatewayServiceMock->expects($this->never())->method('updateStorefrontMemory');

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }

    public function testExecutePostUpdatesMemoryWhenFormKeyIsValid(): void
    {
        $jsonResultMock = $this->createMock(Json::class);
        $jsonResultMock->expects($this->once())->method('setData')->with([
            'success' => true,
            'memories' => [],
        ])->willReturnSelf();

        $this->jsonFactoryMock->expects($this->once())->method('create')->willReturn($jsonResultMock);
        $this->requestMock->method('isPost')->willReturn(true);
        $this->formKeyValidatorMock
            ->expects($this->once())
            ->method('validate')
            ->with($this->requestMock)
            ->willReturn(true);
        $this->requestMock->method('getParam')->willReturnMap([
            ['memory_action', 'add', 'delete'],
            ['category', 'brand_rule', 'brand_rule'],
            ['rule', '', ''],
            ['id', '', 'mem_123'],
            ['clear_all', false, false],
        ]);
        $this->aiGatewayServiceMock
            ->expects($this->once())
            ->method('updateStorefrontMemory')
            ->with('delete', 'brand_rule', '', 'mem_123', false)
            ->willReturn(['success' => true, 'memories' => []]);

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }

    public function testExecuteGetDoesNotRequireFormKey(): void
    {
        $jsonResultMock = $this->createMock(Json::class);
        $jsonResultMock->expects($this->once())->method('setData')->with([
            'success' => true,
            'memories' => [['id' => 'mem_1']],
        ])->willReturnSelf();

        $this->jsonFactoryMock->expects($this->once())->method('create')->willReturn($jsonResultMock);
        $this->requestMock->method('isPost')->willReturn(false);
        $this->requestMock->method('getParam')->willReturnMap([
            ['q', '', 'luxury'],
        ]);
        $this->formKeyValidatorMock->expects($this->never())->method('validate');
        $this->aiGatewayServiceMock
            ->expects($this->once())
            ->method('getStorefrontMemory')
            ->with('luxury')
            ->willReturn(['success' => true, 'memories' => [['id' => 'mem_1']]]);

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }
}
