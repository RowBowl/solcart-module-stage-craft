/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

define([
    'mage/translate',
    'Magento_PageBuilder/js/content-type-menu/option',
    'pagebuilder-collaboration'
], function ($t, Option, collaborationManager) {
    'use strict';

    return function (Preview) {
        var originalRetrieveOptions = Preview.prototype.retrieveOptions,
            originalDispatchAfterRenderEvent = Preview.prototype.dispatchAfterRenderEvent,
            originalDispatchCloneEvents = Preview.prototype.dispatchContentTypeCloneEvents;

        Preview.prototype.retrieveOptions = function () {
            var self = this,
                options = originalRetrieveOptions.apply(this, arguments) || {};

            if (collaborationManager.isEnabledForPreview(this) && !options.comments) {
                options.comments = new Option({
                    preview: this,
                    icon: '<span class="rb-collab-menu-icon" title="' + $t('Comments') + '">&#128172;</span>',
                    title: $t('Comments'),
                    action: function () {
                        collaborationManager.openCommentPopoverForPreview(self);
                    },
                    classes: ['rb-collab-option'],
                    sort: 35
                });
            }

            if (collaborationManager.isAiEnabledForPreview(this) && !options.ai) {
                options.ai = new Option({
                    preview: this,
                    icon: '<span class="rb-collab-ai-icon" title="' + $t('Ask AI') + '">&#10022;</span>',
                    title: $t('AI'),
                    action: function () {
                        collaborationManager.openAiModalForPreview(self);
                    },
                    classes: ['rb-collab-ai-option'],
                    sort: 40
                });
            }

            return options;
        };

        Preview.prototype.dispatchAfterRenderEvent = function () {
            var result = originalDispatchAfterRenderEvent.apply(this, arguments);

            if (this.wrapperElement) {
                collaborationManager.attachPreviewElement(this, this.wrapperElement);
            }

            return result;
        };

        Preview.prototype.dispatchContentTypeCloneEvents = function (
            originalContentType,
            duplicateContentType,
            index,
            direct
        ) {
            collaborationManager.handleContentTypeDuplicated(originalContentType, duplicateContentType);
            return originalDispatchCloneEvents.apply(this, arguments);
        };

        return Preview;
    };
});
