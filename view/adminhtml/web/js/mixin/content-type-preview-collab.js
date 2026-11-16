/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

define([
    'pagebuilder-collaboration'
], function (collaborationManager) {
    'use strict';

    return function (Preview) {
        var originalDispatchAfterRenderEvent = Preview.prototype.dispatchAfterRenderEvent,
            originalDispatchCloneEvents = Preview.prototype.dispatchContentTypeCloneEvents;

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
