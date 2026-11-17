<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\Stdlib\DateTime\DateTime;
use Magento\User\Model\ResourceModel\User\CollectionFactory as UserCollectionFactory;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Solcart\StageCraft\Api\CommentRepositoryInterface;
use Solcart\StageCraft\Api\Data\CommentInterface;
use Solcart\StageCraft\Api\Data\CommentInterfaceFactory;
use Solcart\StageCraft\Model\CollaborationManagement;

class CollaborationManagementTest extends TestCase
{
    /**
     * @var CommentRepositoryInterface|MockObject
     */
    private MockObject $commentRepositoryMock;

    /**
     * @var CommentInterfaceFactory|MockObject
     */
    private MockObject $commentFactoryMock;

    /**
     * @var UserCollectionFactory|MockObject
     */
    private MockObject $userCollectionFactoryMock;

    /**
     * @var Json
     */
    private Json $jsonSerializer;

    /**
     * @var DateTime|MockObject
     */
    private MockObject $dateTimeMock;

    /**
     * @var CollaborationManagement
     */
    private CollaborationManagement $collaborationManagement;

    protected function setUp(): void
    {
        $this->commentRepositoryMock = $this->createMock(CommentRepositoryInterface::class);
        $this->commentFactoryMock = $this->createMock(CommentInterfaceFactory::class);
        $this->userCollectionFactoryMock = $this->createMock(UserCollectionFactory::class);
        $this->jsonSerializer = new Json();
        $this->dateTimeMock = $this->createMock(DateTime::class);

        $this->collaborationManagement = new CollaborationManagement(
            $this->commentRepositoryMock,
            $this->commentFactoryMock,
            $this->userCollectionFactoryMock,
            $this->jsonSerializer,
            $this->dateTimeMock
        );
    }

    public function testExtractMentionsReturnsNormalizedUniqueUsernames(): void
    {
        $mentions = $this->collaborationManagement->extractMentions(
            'Hey @Alice.Admin and @bob_editor, please check Row 1 with @alice.admin!'
        );

        $this->assertSame(['alice.admin', 'bob_editor'], $mentions);
    }

    public function testGetThreadPayloadGroupsRepliesAndComputesCounts(): void
    {
        $rootComment = $this->createConfiguredMock(CommentInterface::class, [
            'getCommentId' => 10,
            'getParentId' => null,
            'getInstanceKey' => 'cms_page:2:content',
            'getEntityType' => 'cms_page',
            'getEntityId' => '2',
            'getFieldName' => 'content',
            'getTargetType' => 'row',
            'getTargetId' => 'rbc-row-1',
            'getStructuralPath' => 'row:0',
            'getTargetLabel' => 'Row #1',
            'getAdminUserId' => 1,
            'getAuthorName' => 'Jane Doe',
            'getAuthorUsername' => 'jdoe',
            'getCommentText' => 'Please update hero banner @bob',
            'getMentionsJson' => '["bob"]',
            'getStatus' => CommentInterface::STATUS_OPEN,
        ]);

        $replyComment = $this->createConfiguredMock(CommentInterface::class, [
            'getCommentId' => 11,
            'getParentId' => 10,
            'getInstanceKey' => 'cms_page:2:content',
            'getEntityType' => 'cms_page',
            'getEntityId' => '2',
            'getFieldName' => 'content',
            'getTargetType' => 'row',
            'getTargetId' => 'rbc-row-1',
            'getStructuralPath' => 'row:0',
            'getTargetLabel' => 'Row #1',
            'getAdminUserId' => 2,
            'getAuthorName' => 'Bob Editor',
            'getAuthorUsername' => 'bob',
            'getCommentText' => 'Working on it now!',
            'getMentionsJson' => '[]',
            'getStatus' => CommentInterface::STATUS_OPEN,
        ]);

        $this->commentRepositoryMock
            ->expects($this->once())
            ->method('getByInstanceKey')
            ->with('cms_page:2:content')
            ->willReturn([$rootComment, $replyComment]);

        $payload = $this->collaborationManagement->getThreadPayload('cms_page:2:content');

        $this->assertSame('cms_page:2:content', $payload['instance_key']);
        $this->assertCount(1, $payload['threads']);
        $this->assertCount(1, $payload['threads'][0]['replies']);
        $this->assertSame(1, $payload['counts']['open_threads']);
        $this->assertSame(2, $payload['counts']['by_target_id']['rbc-row-1']['messages']);
        $this->assertSame(['bob'], $payload['counts']['by_target_id']['rbc-row-1']['mentions']);
    }

    public function testCreateCommentThrowsExceptionOnEmptyText(): void
    {
        $this->expectException(LocalizedException::class);

        $this->collaborationManagement->createComment(
            [
                'instance_key' => 'cms_page:2:content',
                'comment_text' => '   ',
            ],
            1,
            'Admin User',
            'admin'
        );
    }

    public function testGetThreadPayloadMergesBaseAndDemoSessionThreads(): void
    {
        $baseComment = $this->createConfiguredMock(CommentInterface::class, [
            'getCommentId' => 1,
            'getParentId' => null,
            'getInstanceKey' => 'cms_page:2:content',
            'getTargetType' => 'row',
            'getTargetId' => 'rbc-row-1',
            'getStructuralPath' => 'row:0',
            'getStatus' => CommentInterface::STATUS_OPEN,
        ]);

        $sessionComment = $this->createConfiguredMock(CommentInterface::class, [
            'getCommentId' => 2,
            'getParentId' => null,
            'getInstanceKey' => 'cms_page:2:content#demo_s1',
            'getTargetType' => 'row',
            'getTargetId' => 'rbc-row-2',
            'getStructuralPath' => 'row:1',
            'getStatus' => CommentInterface::STATUS_OPEN,
        ]);

        $this->commentRepositoryMock
            ->method('getByInstanceKey')
            ->willReturnMap([
                ['cms_page:2:content#demo_s1', [$sessionComment]],
                ['cms_page:2:content', [$baseComment]],
            ]);

        $payload = $this->collaborationManagement->getThreadPayload('cms_page:2:content#demo_s1');

        $this->assertCount(2, $payload['threads']);
        $this->assertSame(1, $payload['threads'][0]['comment_id']);
        $this->assertSame(2, $payload['threads'][1]['comment_id']);
    }
}
