<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Controller\Adminhtml\Ai;

use Magento\Backend\App\Action\Context;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Solcart\StageCraft\Controller\Adminhtml\Ai\MigrateContext;
use Solcart\StageCraft\Model\AiGatewayService;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;

class MigrateContextTest extends TestCase
{
    private MockObject $requestMock;
    private MockObject $jsonFactoryMock;
    private MockObject $formKeyValidatorMock;
    private MockObject $aiGatewayServiceMock;
    private MockObject $commentResourceMock;
    private MigrateContext $controller;

    protected function setUp(): void
    {
        $this->requestMock = $this->createMock(RequestInterface::class);
        $contextMock = $this->createConfiguredMock(Context::class, [
            'getRequest' => $this->requestMock,
        ]);

        $this->jsonFactoryMock = $this->createMock(JsonFactory::class);
        $this->formKeyValidatorMock = $this->createMock(FormKeyValidator::class);
        $this->aiGatewayServiceMock = $this->createMock(AiGatewayService::class);
        $this->commentResourceMock = $this->createMock(CommentResource::class);

        $this->controller = new MigrateContext(
            $contextMock,
            $this->jsonFactoryMock,
            $this->formKeyValidatorMock,
            $this->aiGatewayServiceMock,
            $this->commentResourceMock
        );
    }

    public function testExecuteReturns400WhenFormKeyIsInvalid(): void
    {
        $jsonResultMock = $this->createMock(Json::class);
        $jsonResultMock->expects($this->once())->method('setHttpResponseCode')->with(400)->willReturnSelf();
        $jsonResultMock->expects($this->once())->method('setData')->with($this->callback(
            static fn(array $data): bool => $data['success'] === false
        ))->willReturnSelf();

        $this->jsonFactoryMock->expects($this->once())->method('create')->willReturn($jsonResultMock);
        $this->formKeyValidatorMock
            ->expects($this->once())
            ->method('validate')
            ->with($this->requestMock)
            ->willReturn(false);
        $this->aiGatewayServiceMock->expects($this->never())->method('migrateConversations');
        $this->commentResourceMock->expects($this->never())->method('migrateEntityComments');

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }

    public function testExecuteMigratesConversationsAndDraftCommentsWithPerTabToken(): void
    {
        $jsonResultMock = $this->createMock(Json::class);
        $jsonResultMock->expects($this->once())->method('setData')->with([
            'success' => true,
            'migrated' => true,
            'migrated_comments' => 3,
        ])->willReturnSelf();

        $this->jsonFactoryMock->expects($this->once())->method('create')->willReturn($jsonResultMock);
        $this->formKeyValidatorMock
            ->expects($this->once())
            ->method('validate')
            ->with($this->requestMock)
            ->willReturn(true);

        $this->requestMock->method('getParam')->willReturnMap([
            ['from_page_key', '', 'cms_page:new_k3m9x2a1'],
            ['to_page_key', '', 'cms_page:42'],
            ['page_title', '', 'Landing Page'],
        ]);

        $this->aiGatewayServiceMock
            ->expects($this->once())
            ->method('migrateConversations')
            ->with('cms_page:new_k3m9x2a1', 'cms_page:42', 'Landing Page')
            ->willReturn(['success' => true, 'migrated' => true]);

        $this->commentResourceMock
            ->expects($this->once())
            ->method('migrateEntityComments')
            ->with('cms_page', 'new_k3m9x2a1', '42')
            ->willReturn(3);

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }

    public function testExecuteDoesNotMigrateCommentsForNonDraftSourceKey(): void
    {
        $jsonResultMock = $this->createMock(Json::class);
        $jsonResultMock->expects($this->once())->method('setData')->with([
            'success' => true,
            'migrated' => false,
            'migrated_comments' => 0,
        ])->willReturnSelf();

        $this->jsonFactoryMock->expects($this->once())->method('create')->willReturn($jsonResultMock);
        $this->formKeyValidatorMock->method('validate')->willReturn(true);

        $this->requestMock->method('getParam')->willReturnMap([
            ['from_page_key', '', 'cms_page:10'],
            ['to_page_key', '', 'cms_page:42'],
            ['page_title', '', 'Landing Page'],
        ]);

        $this->aiGatewayServiceMock
            ->expects($this->once())
            ->method('migrateConversations')
            ->willReturn(['success' => true, 'migrated' => false]);

        $this->commentResourceMock->expects($this->never())->method('migrateEntityComments');

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }
}
