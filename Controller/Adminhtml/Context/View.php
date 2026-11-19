<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Controller\Adminhtml\Context;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;

class View extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Solcart_StageCraft::ai';

    /**
     * @param Context $context
     * @param PageFactory $resultPageFactory
     */
    public function __construct(
        Context $context,
        private readonly PageFactory $resultPageFactory
    ) {
        parent::__construct($context);
    }

    /**
     * Render the StageCraft AI Page Conversation History detail screen.
     *
     * @return Page
     */
    public function execute(): Page
    {
        $pageKey = trim((string)$this->getRequest()->getParam('page_key', ''));
        $titleSuffix = $pageKey !== '' ? (' — ' . $pageKey) : '';

        /** @var Page $resultPage */
        $resultPage = $this->resultPageFactory->create();
        $resultPage->setActiveMenu('Solcart_StageCraft::context_manager');
        $resultPage->getConfig()->getTitle()->prepend(__('AI Page Conversation History') . $titleSuffix);

        return $resultPage;
    }
}
