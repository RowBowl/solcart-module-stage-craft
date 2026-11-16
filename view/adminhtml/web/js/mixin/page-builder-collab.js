/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

define([
    'jquery',
    'underscore',
    'Magento_PageBuilder/js/events',
    'pagebuilder-collaboration'
], function ($, _, events, collaborationManager) {
    'use strict';

    return function (PageBuilder) {
        var originalInitListeners = PageBuilder.prototype.initListeners,
            originalDestroy = PageBuilder.prototype.destroy;

        PageBuilder.prototype.initListeners = function () {
            var self = this,
                result = originalInitListeners.apply(this, arguments);

            events.on('stage:' + this.id + ':readyAfter', function () {
                _.defer(function () {
                    collaborationManager.registerPageBuilder(self);
                });
            });

            events.on('stage:' + this.id + ':fullScreenModeChangeAfter', function (args) {
                _. delay(function () {
                    collaborationManager.onFullScreenChange(self, args && args.fullScreen);
                }, 60);
            });

            return result;
        };

        PageBuilder.prototype.destroy = function () {
            collaborationManager.unregisterPageBuilder(this);
            return originalDestroy.apply(this, arguments);
        };

        return PageBuilder;
    };
});
