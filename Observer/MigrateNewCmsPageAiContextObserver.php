<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Observer;

use Magento\Cms\Model\Page;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Solcart\StageCraft\Model\AiGatewayService;

class MigrateNewCmsPageAiContextObserver implements ObserverInterface
{
    /**
     * @param AiGatewayService $aiGatewayService
     */
    public function __construct(
        private readonly AiGatewayService $aiGatewayService
    ) {
    }

    /**
     * When a new CMS Page is saved for the first time, assign any cms_page:new Scaffolder/Block AI context to it.
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
            $this->aiGatewayService->migrateConversations(
                'cms_page:new',
                'cms_page:' . $pageId,
                (string)$object->getTitle()
            );
        }
    }
}
