<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Observer;

use Magento\Cms\Model\Page;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Solcart\StageCraft\Model\AiGatewayService;
use Solcart\StageCraft\Model\ResourceModel\Comment as CommentResource;

class MigrateNewCmsPageAiContextObserver implements ObserverInterface
{
    public const DRAFT_PAGE_KEY_PARAM = 'solcart_stagecraft_draft_page_key';

    /**
     * @param AiGatewayService $aiGatewayService
     * @param RequestInterface $request
     * @param CommentResource $commentResource
     */
    public function __construct(
        private readonly AiGatewayService $aiGatewayService,
        private readonly RequestInterface $request,
        private readonly CommentResource $commentResource
    ) {
    }

    /**
     * When a new CMS Page is saved for the first time, migrate any draft Scaffolder/Block AI context
     * and pre-save collaborative comments from the draft key (cms_page:new or cms_page:new_<token>) to the saved ID.
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        $object = $observer->getEvent()->getData('object');
        if (!$object instanceof Page) {
            return;
        }

        $pageId = (int)$object->getId();
        if ($pageId <= 0) {
            return;
        }

        if ($object->isObjectNew() || !$object->getOrigData('page_id')) {
            [$fromPageKey, $fromEntityId] = $this->resolveDraftPageKey();
            $toPageKey = 'cms_page:' . $pageId;

            $this->aiGatewayService->migrateConversations(
                $fromPageKey,
                $toPageKey,
                (string)$object->getTitle()
            );

            $this->commentResource->migrateEntityComments(
                'cms_page',
                $fromEntityId,
                (string)$pageId
            );
        }
    }

    /**
     * Resolve the draft page key and entity ID from the request, falling back to legacy cms_page:new.
     *
     * @return string[] [pageKey, entityId]
     */
    private function resolveDraftPageKey(): array
    {
        $rawDraftKey = trim((string)$this->request->getParam(self::DRAFT_PAGE_KEY_PARAM, ''));
        if ($rawDraftKey !== '' && preg_match('/^cms_page:(new(?:_[a-zA-Z0-9_-]{1,64})?)$/', $rawDraftKey, $matches)) {
            return [$rawDraftKey, $matches[1]];
        }

        return ['cms_page:new', 'new'];
    }
}
