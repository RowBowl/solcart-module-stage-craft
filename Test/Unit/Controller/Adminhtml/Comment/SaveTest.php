<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Controller\Adminhtml\Comment;

use Magento\Backend\App\Action\Context;
use Magento\Backend\Model\Auth\Session as AuthSession;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Api\CollaborationManagementInterface;
use Solcart\StageCraft\Controller\Adminhtml\Comment\Save;

class SaveTest extends TestCase
{
    /**
     * @var RequestInterface|MockObject
     */
    private MockObject $requestMock;

    /**
     * @var JsonFactory|MockObject
     */
    private MockObject $jsonFactoryMock;

    /**
     * @var FormKeyValidator|MockObject
     */
    private MockObject $formKeyValidatorMock;

    /**
     * @var CollaborationManagementInterface|MockObject
     */
    private MockObject $collaborationManagementMock;

    /**
     * @var AuthSession|MockObject
     */
    private MockObject $authSessionMock;

    /**
     * @var LoggerInterface|MockObject
     */
    private MockObject $loggerMock;

    /**
     * @var Save
     */
    private Save $controller;

    protected function setUp(): void
    {
        $this->requestMock = $this->createMock(RequestInterface::class);
        $contextMock = $this->createConfiguredMock(Context::class, [
            'getRequest' => $this->requestMock,
        ]);

        $this->jsonFactoryMock = $this->createMock(JsonFactory::class);
        $this->formKeyValidatorMock = $this->createMock(FormKeyValidator::class);
        $this->collaborationManagementMock = $this->createMock(CollaborationManagementInterface::class);
        $this->authSessionMock = $this->createMock(AuthSession::class);
        $this->loggerMock = $this->createMock(LoggerInterface::class);

        $this->controller = new Save(
            $contextMock,
            $this->jsonFactoryMock,
            $this->formKeyValidatorMock,
            $this->collaborationManagementMock,
            $this->authSessionMock,
            $this->loggerMock
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

        $this->assertSame($jsonResultMock, $this->controller->execute());
    }
}
