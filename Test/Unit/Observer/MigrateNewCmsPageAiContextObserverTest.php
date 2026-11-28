<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Observer;

use Magento\Cms\Model\Page;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Solcart\StageCraft\Model\AiGatewayService;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;
use Solcart\StageCraft\Observer\MigrateNewCmsPageAiContextObserver;

class MigrateNewCmsPageAiContextObserverTest extends TestCase
{
    private MockObject $aiGatewayServiceMock;
    private MockObject $requestMock;
    private MockObject $commentResourceMock;
    private MigrateNewCmsPageAiContextObserver $observer;

    protected function setUp(): void
    {
        $this->aiGatewayServiceMock = $this->createMock(AiGatewayService::class);
        $this->requestMock = $this->createMock(RequestInterface::class);
        $this->commentResourceMock = $this->createMock(CommentResource::class);

        $this->observer = new MigrateNewCmsPageAiContextObserver(
            $this->aiGatewayServiceMock,
            $this->requestMock,
            $this->commentResourceMock
        );
    }

    public function testExecuteMigratesPerTabDraftTokenConversationsAndComments(): void
    {
        $pageMock = $this->createMock(Page::class);
        $pageMock->method('getId')->willReturn(55);
        $pageMock->method('isObjectNew')->willReturn(true);
        $pageMock->method('getTitle')->willReturn('Spring Campaign');

        $eventMock = $this->createMock(Event::class);
        $eventMock->method('getData')->with('object')->willReturn($pageMock);

        $observerMock = $this->createMock(Observer::class);
        $observerMock->method('getEvent')->willReturn($eventMock);

        $this->requestMock
            ->method('getParam')
            ->with(MigrateNewCmsPageAiContextObserver::DRAFT_PAGE_KEY_PARAM, '')
            ->willReturn('cms_page:new_ab12cd34');

        $this->aiGatewayServiceMock
            ->expects($this->once())
            ->method('migrateConversations')
            ->with('cms_page:new_ab12cd34', 'cms_page:55', 'Spring Campaign');

        $this->commentResourceMock
            ->expects($this->once())
            ->method('migrateEntityComments')
            ->with('cms_page', 'new_ab12cd34', '55')
            ->willReturn(2);

        $this->observer->execute($observerMock);
    }

    public function testExecuteFallsBackToLegacyNewKeyWhenDraftParamAbsent(): void
    {
        $pageMock = $this->createMock(Page::class);
        $pageMock->method('getId')->willReturn(56);
        $pageMock->method('isObjectNew')->willReturn(false);
        $pageMock->method('getOrigData')->with('page_id')->willReturn(null);
        $pageMock->method('getTitle')->willReturn('Legacy Draft Page');

        $eventMock = $this->createMock(Event::class);
        $eventMock->method('getData')->with('object')->willReturn($pageMock);

        $observerMock = $this->createMock(Observer::class);
        $observerMock->method('getEvent')->willReturn($eventMock);

        $this->requestMock
            ->method('getParam')
            ->with(MigrateNewCmsPageAiContextObserver::DRAFT_PAGE_KEY_PARAM, '')
            ->willReturn('');

        $this->aiGatewayServiceMock
            ->expects($this->once())
            ->method('migrateConversations')
            ->with('cms_page:new', 'cms_page:56', 'Legacy Draft Page');

        $this->commentResourceMock
            ->expects($this->once())
            ->method('migrateEntityComments')
            ->with('cms_page', 'new', '56')
            ->willReturn(1);

        $this->observer->execute($observerMock);
    }

    public function testExecuteSkipsMigrationForExistingSavedPage(): void
    {
        $pageMock = $this->createMock(Page::class);
        $pageMock->method('getId')->willReturn(57);
        $pageMock->method('isObjectNew')->willReturn(false);
        $pageMock->method('getOrigData')->with('page_id')->willReturn(57);

        $eventMock = $this->createMock(Event::class);
        $eventMock->method('getData')->with('object')->willReturn($pageMock);

        $observerMock = $this->createMock(Observer::class);
        $observerMock->method('getEvent')->willReturn($eventMock);

        $this->aiGatewayServiceMock->expects($this->never())->method('migrateConversations');
        $this->commentResourceMock->expects($this->never())->method('migrateEntityComments');

        $this->observer->execute($observerMock);
    }
}
