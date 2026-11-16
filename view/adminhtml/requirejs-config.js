/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

var config = {
    map: {
        '*': {
            'pagebuilder-collaboration': 'Solcart_StageCraft/js/collaboration-manager'
        }
    },
    config: {
        mixins: {
            'Magento_PageBuilder/js/content-type/preview': {
                'Solcart_StageCraft/js/mixin/content-type-preview-collab': true
            },
            'Magento_PageBuilder/js/page-builder': {
                'Solcart_StageCraft/js/mixin/page-builder-collab': true
            }
        }
    }
};
