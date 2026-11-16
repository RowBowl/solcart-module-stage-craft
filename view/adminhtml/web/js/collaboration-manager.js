/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

define([
    'jquery',
    'underscore',
    'mage/translate',
    'Magento_PageBuilder/js/events',
    'Magento_PageBuilder/js/config',
    'Magento_PageBuilder/js/content-type-factory'
], function ($, _, $t, events, pbConfig, contentTypeFactory) {
    'use strict';

    var runtimeConfig = {
        enabled: false,
        enablePageComments: true,
        enableFloatingPins: true,
        enabledContentTypes: [
            'row',
            'column-group',
            'column',
            'text',
            'heading',
            'banner',
            'slider',
            'slide',
            'html',
            'image',
            'buttons',
            'button-item',
            'tabs',
            'tab-item',
            'block',
            'products',
            'video',
            'map',
            'divider'
        ],
        aiIntegrationEnabled: true,
        ai: {
            enabled: true,
            disabledContentTypes: [],
            hasLicenseKey: false
        },
        pollingInterval: 0,
        entityType: 'cms_page',
        entityId: 'new',
        formKey: '',
        currentUser: {
            user_id: null,
            username: 'admin',
            name: 'Admin User'
        },
        permissions: {
            view: true,
            comment: true,
            resolve: true,
            ai: true,
            delete: true
        },
        urls: {
            list: '',
            save: '',
            status: '',
            delete: '',
            aiChat: '',
            aiAudit: '',
            aiActivateTrial: '',
            aiStatus: ''
        }
    };

    var instancesByStageId = {},
        previewsByStageId = {},
        aiSessionsByTargetKey = {},
        mentionableUsers = [],
        usersLoaded = false,
        pinsVisible = true,
        activePopoverState = null,
        aiUsageState = {
            plan: 'trial',
            credits_remaining: null,
            trial_days_left: null,
            upgrade_url: ''
        },
        pollingTimer = null,
        globalListenersBound = false;

    var COLLAB_CLASS_PREFIX = 'rb-collab-id-';

    function renderSolcartMarkSvg(sizePx) {
        var sz = sizePx || 16;
        return '<svg class="rb-collab-brand-svg" xmlns="http://www.w3.org/2000/svg" width="' + sz + '" height="' + sz + '" viewBox="0 0 512 512" aria-hidden="true" style="vertical-align:middle;flex-shrink:0;">' +
            '<defs><linearGradient id="solcart-mars-grad" x1="105.74" y1="516.26" x2="406.26" y2="-4.26" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#881337"/><stop offset="0.5" stop-color="#e11d48"/><stop offset="1" stop-color="#fb923c"/>' +
            '</linearGradient></defs>' +
            '<circle cx="256" cy="256" r="220" fill="url(#solcart-mars-grad)"/>' +
            '<path d="M446.53 366 A220 220 0 0 1 65.47 366 Q256 323.07 446.53 366 Z" fill="#6b112b"/>' +
            '<path d="M114.59 87.47 A220 220 0 0 1 397.41 87.47 Q256 116.98 114.59 87.47 Z" fill="#e0f2fe"/>' +
            '<path d="M366 446.53 A220 220 0 0 1 146 446.53 Q256 427.75 366 446.53 Z" fill="#e0f2fe"/>' +
            '<path d="M245.27 151.37 L357.95 151.37 L357.95 264.05 L239.9 382.1 Q218.44 403.56 196.98 382.1 L127.22 312.34 Q105.76 290.88 127.22 269.41 Z" fill="none" stroke="#e0f2fe" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="180.88" y1="306.98" x2="234.54" y2="253.32" stroke="#e0f2fe" stroke-width="24" stroke-linecap="round"/>' +
            '<polygon points="298.93,164.78 309.37,199.95 344.54,210.39 309.37,220.83 298.93,256 288.49,220.83 253.32,210.39 288.49,199.95" fill="#38bdf8"/>' +
            '</svg>';
    }

    function escapeHtml(value) {
        return $('<div></div>').text(value === null || value === undefined ? '' : String(value)).html();
    }

    function normalizeType(value) {
        return (value || '').toString().trim().toLowerCase();
    }

    function generateCollabUuid() {
        var rand = Math.random().toString(36).substring(2, 8),
            ts = Date.now().toString(36);

        return 'rbc-' + ts + '-' + rand;
    }

    function getAuthorInitials(name) {
        var parts = (name || 'Admin').trim().split(/\s+/);

        if (parts.length >= 2) {
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }

        return (parts[0] || 'A').substring(0, 2).toUpperCase();
    }

    function formatCommentBodyHtml(rawText) {
        var escaped = escapeHtml(rawText || '');

        return escaped.replace(/@([a-zA-Z0-9._-]{2,64})/g, function (match, username) {
            var isMe = runtimeConfig.currentUser &&
                normalizeType(runtimeConfig.currentUser.username) === normalizeType(username);

            return '<span class="rb-collab-mention' + (isMe ? ' rb-collab-mention-me' : '') + '">' +
                escapeHtml(match) + '</span>';
        });
    }

    function formatTimestamp(ts) {
        if (!ts) {
            return $t('Just now');
        }

        return String(ts).replace('T', ' ').substring(0, 16);
    }

    function getPreviewContentTypeName(preview) {
        if (!preview || !preview.contentType || !preview.contentType.config) {
            return '';
        }

        return normalizeType(preview.contentType.config.name || '');
    }

    function computeStructuralPath(contentType) {
        var segments = [],
            cursor = contentType;

        while (cursor && cursor.parentContentType) {
            var parent = cursor.parentContentType,
                children = (typeof parent.getChildren === 'function') ? parent.getChildren()() : [],
                idx = Array.isArray(children) ? children.indexOf(cursor) : -1,
                typeName = (cursor.config && cursor.config.name) ? cursor.config.name : 'item';

            segments.unshift(typeName + ':' + (idx >= 0 ? idx : 0));
            cursor = parent;
        }

        return segments.join('/');
    }

    function computeTargetLabel(preview, structuralPath) {
        if (!preview || !preview.contentType || !preview.contentType.config) {
            return $t('Element');
        }

        var label = preview.contentType.config.label || preview.contentType.config.name || 'Element',
            match = (structuralPath || '').match(/(?:^|\/)([a-z0-9_-]+):(\d+)$/i);

        if (match) {
            return label + ' #' + (parseInt(match[2], 10) + 1);
        }

        return label;
    }

    function readCollabIdFromDataStore(contentType) {
        if (!contentType || !contentType.dataStore) {
            return '';
        }

        var directId = contentType.dataStore.get('collab_id');
        if (directId && typeof directId === 'string' && directId.trim() !== '') {
            return directId.trim();
        }

        var cssClasses = (contentType.dataStore.get('css_classes') || '').toString(),
            match = cssClasses.match(/(?:^|\s)rb-collab-id-([a-zA-Z0-9_-]+)(?:\s|$)/);

        if (match && match[1]) {
            return match[1];
        }

        return '';
    }

    function persistCollabIdToDataStore(contentType, collabId) {
        if (!contentType || !contentType.dataStore || !collabId) {
            return;
        }

        var typeName = normalizeType(contentType.config && contentType.config.name);
        if (typeName === 'row') {
            contentType.dataStore.set('collab_id', collabId);
        }

        var currentCss = (contentType.dataStore.get('css_classes') || '').toString(),
            cleanedCss = currentCss.replace(/(?:^|\s)rb-collab-id-[a-zA-Z0-9_-]+(?=\s|$)/g, ' ').trim(),
            token = COLLAB_CLASS_PREFIX + collabId,
            nextCss = cleanedCss ? (cleanedCss + ' ' + token) : token;

        if (currentCss.trim() !== nextCss.trim()) {
            contentType.dataStore.set('css_classes', nextCss);
        }
    }

    function stripCollabIdFromClone(contentType) {
        if (!contentType || !contentType.dataStore) {
            return;
        }

        var newId = generateCollabUuid();
        contentType.rbCollabId = newId;
        if (contentType.preview) {
            contentType.preview.rbCollabId = newId;
        }

        if (contentType.dataStore.get('collab_id')) {
            contentType.dataStore.set('collab_id', '');
        }

        var currentCss = (contentType.dataStore.get('css_classes') || '').toString();
        if (currentCss.indexOf(COLLAB_CLASS_PREFIX) !== -1) {
            var cleaned = currentCss.replace(/(?:^|\s)rb-collab-id-[a-zA-Z0-9_-]+(?=\s|$)/g, ' ').trim();
            contentType.dataStore.set('css_classes', cleaned);
        }

        if (typeof contentType.getChildren === 'function') {
            var children = contentType.getChildren()() || [];
            children.forEach(function (child) {
                stripCollabIdFromClone(child);
            });
        }
    }

    function resolvePreviewIdentity(preview, persistIfMissing) {
        if (!preview || !preview.contentType) {
            return {
                targetId: 'page',
                targetType: 'page',
                structuralPath: 'page',
                targetLabel: $t('Page')
            };
        }

        var contentType = preview.contentType,
            targetType = getPreviewContentTypeName(preview) || 'row',
            structuralPath = computeStructuralPath(contentType),
            targetLabel = computeTargetLabel(preview, structuralPath),
            stageId = contentType.stageId,
            instanceState = instancesByStageId[stageId],
            collabId = readCollabIdFromDataStore(contentType) || preview.rbCollabId || contentType.rbCollabId || '';

        if (!collabId && instanceState && instanceState.threads && instanceState.threads.length) {
            var matchedThread = _.find(instanceState.threads, function (t) {
                return t.structural_path && t.structural_path === structuralPath && t.target_id && t.target_id !== 'page';
            });

            if (matchedThread) {
                collabId = matchedThread.target_id;
            }
        }

        if (!collabId) {
            collabId = generateCollabUuid();
        }

        preview.rbCollabId = collabId;
        contentType.rbCollabId = collabId;

        if (persistIfMissing) {
            persistCollabIdToDataStore(contentType, collabId);
        }

        return {
            targetId: collabId,
            targetType: targetType,
            structuralPath: structuralPath,
            targetLabel: targetLabel
        };
    }

    function detectFieldNameForStage(pageBuilder) {
        if (!pageBuilder || !pageBuilder.stage) {
            return 'content';
        }

        var $stageEl = $('#' + pageBuilder.stage.id);
        if (!$stageEl.length) {
            return 'content';
        }

        var $field = $stageEl.closest('[data-index]');
        if ($field.length && $field.attr('data-index')) {
            return $field.attr('data-index');
        }

        var $textarea = $stageEl.closest('.pagebuilder-wysiwyg-wrapper').find('textarea[name]');
        if ($textarea.length && $textarea.attr('name')) {
            return $textarea.attr('name');
        }

        return 'content';
    }

    function buildInstanceKey(fieldName) {
        var entityType = runtimeConfig.entityType || 'cms_page',
            entityId = runtimeConfig.entityId || 'new',
            field = fieldName || 'content';

        return entityType + ':' + entityId + ':' + field;
    }

    function getThreadsForTarget(instanceState, targetInfo) {
        if (!instanceState || !Array.isArray(instanceState.threads)) {
            return [];
        }

        if (targetInfo.targetType === 'page' || targetInfo.targetId === 'page') {
            return instanceState.threads.filter(function (thread) {
                return thread.target_type === 'page' || thread.target_id === 'page';
            });
        }

        return instanceState.threads.filter(function (thread) {
            if (thread.target_type === 'page' || thread.target_id === 'page') {
                return false;
            }
            if (targetInfo.targetId && thread.target_id === targetInfo.targetId) {
                return true;
            }
            if (targetInfo.structuralPath && thread.structural_path === targetInfo.structuralPath) {
                return true;
            }
            return false;
        });
    }

    function summarizeTargetThreads(threads) {
        var total = threads.length,
            open = 0,
            resolved = 0,
            messages = 0,
            mentionedMe = false,
            myUsername = normalizeType(runtimeConfig.currentUser && runtimeConfig.currentUser.username);

        threads.forEach(function (thread) {
            var isOpen = thread.status !== 'resolved',
                replies = Array.isArray(thread.replies) ? thread.replies : [];

            if (isOpen) {
                open++;
            } else {
                resolved++;
            }

            messages += (1 + replies.length);

            if (isOpen && myUsername) {
                var rootMentions = Array.isArray(thread.mentions) ? thread.mentions.map(normalizeType) : [];
                if (rootMentions.indexOf(myUsername) !== -1) {
                    mentionedMe = true;
                }
                replies.forEach(function (reply) {
                    var replyMentions = Array.isArray(reply.mentions) ? reply.mentions.map(normalizeType) : [];
                    if (replyMentions.indexOf(myUsername) !== -1) {
                        mentionedMe = true;
                    }
                });
            }
        });

        return {
            total: total,
            open: open,
            resolved: resolved,
            messages: messages,
            mentionedMe: mentionedMe
        };
    }

    function isEnabledForPreview(preview) {
        if (!runtimeConfig.enabled) {
            return false;
        }

        var type = getPreviewContentTypeName(preview);
        if (!type || type === 'root-container') {
            return false;
        }

        var enabledTypes = (runtimeConfig.enabledContentTypes || []).map(normalizeType);
        if (type === 'column-group' && enabledTypes.indexOf('column') !== -1) {
            return true;
        }
        return enabledTypes.indexOf(type) !== -1;
    }

    function isAiEnabledForPreview(preview) {
        if (!runtimeConfig.ai || !runtimeConfig.ai.enabled || !runtimeConfig.permissions.ai) {
            return false;
        }

        var type = getPreviewContentTypeName(preview);
        if (!type || type === 'root-container') {
            return false;
        }

        var disabledTypes = ((runtimeConfig.ai && runtimeConfig.ai.disabledContentTypes) || []).map(normalizeType);
        return disabledTypes.indexOf(type) === -1;
    }

    function mapMagentoButtonType(rawType) {
        var t = normalizeType(rawType || 'primary');
        if (t === 'pagebuilder-button-primary' || t === 'pagebuilder-button-secondary' || t === 'pagebuilder-button-link') {
            return t;
        }
        if (t === 'secondary') {
            return 'pagebuilder-button-secondary';
        }
        if (t === 'link') {
            return 'pagebuilder-button-link';
        }
        return 'pagebuilder-button-primary';
    }

    function serializeChildBlockSummary(ct) {
        if (!ct || !ct.config) {
            return '';
        }
        var type = normalizeType(ct.config.name),
            state = ct.dataStore ? (ct.dataStore.getState() || {}) : {};

        if (type === 'heading') {
            return '[heading (' + (state.heading_type || 'h2') + '): "' + (state.heading_text || '') + '"]';
        }
        if (type === 'text') {
            var plain = $('<div></div>').html(state.content || '').text().trim().slice(0, 120);
            return '[text: "' + plain + '"]';
        }
        if (type === 'buttons') {
            var btnChildren = typeof ct.getChildren === 'function' ? (ct.getChildren()() || []) : [],
                labels = btnChildren.map(function (b) {
                    return b.dataStore ? (b.dataStore.get('button_text') || 'Button') : 'Button';
                });
            return '[buttons: ' + (labels.join(', ') || 'Button') + ']';
        }
        if (type === 'banner') {
            var bPlain = $('<div></div>').html(state.message || '').text().trim().slice(0, 100);
            return '[banner: "' + bPlain + '", button: "' + (state.button_text || '') + '"]';
        }
        return '[' + type + ']';
    }

    function collectColumnsInSubtree(rootCt) {
        var found = [];
        if (!rootCt || typeof rootCt.getChildren !== 'function') {
            return found;
        }
        var children = rootCt.getChildren()() || [];
        children.forEach(function (ch) {
            var t = normalizeType(ch && ch.config && ch.config.name);
            if (t === 'column') {
                found.push(ch);
            } else {
                found = found.concat(collectColumnsInSubtree(ch));
            }
        });
        return found;
    }

    function getPreviewContextContent(preview) {
        if (!preview || !preview.contentType) {
            return '';
        }

        var ct = preview.contentType,
            type = getPreviewContentTypeName(preview),
            lines = [];

        if (type === 'row' || type === 'column-group' || type === 'column-line') {
            var cols = collectColumnsInSubtree(ct);
            if (cols.length > 0) {
                var widths = cols.map(function (c) {
                    return (c.dataStore && c.dataStore.get('width')) || '50%';
                });
                lines.push('Current Stage Structure: ' + cols.length + ' Columns (' + widths.join(', ') + ')');
                cols.forEach(function (colCt, idx) {
                    var w = (colCt.dataStore && colCt.dataStore.get('width')) || '50%',
                        colChildren = typeof colCt.getChildren === 'function' ? (colCt.getChildren()() || []) : [],
                        summaries = colChildren.map(serializeChildBlockSummary).filter(Boolean);
                    lines.push('- Column ' + (idx + 1) + ' (' + w + '): ' + (summaries.join(' | ') || '[Empty Column]'));
                });
                return lines.join('\n').slice(0, 4000);
            }
        }

        if (type === 'tabs' || type === 'tab-item') {
            var tabsCt = type === 'tab-item' ? ct.parentContentType : ct,
                tabItems = (tabsCt && typeof tabsCt.getChildren === 'function') ? (tabsCt.getChildren()() || []) : [];
            if (tabItems.length > 0) {
                lines.push('Current Stage Structure: ' + tabItems.length + ' Tabs');
                tabItems.forEach(function (tCt, idx) {
                    var tName = (tCt.dataStore && tCt.dataStore.get('tab_name')) || ('Tab ' + (idx + 1)),
                        tChildren = typeof tCt.getChildren === 'function' ? (tCt.getChildren()() || []) : [],
                        tSummaries = tChildren.map(serializeChildBlockSummary).filter(Boolean);
                    lines.push('- Tab ' + (idx + 1) + ' ("' + tName + '"): ' + (tSummaries.join(' | ') || '[Empty Tab]'));
                });
                return lines.join('\n').slice(0, 4000);
            }
        }

        if (type === 'column') {
            var cChildren = typeof ct.getChildren === 'function' ? (ct.getChildren()() || []) : [],
                cSummaries = cChildren.map(serializeChildBlockSummary).filter(Boolean);
            if (cSummaries.length > 0) {
                return ('Current Stage Structure: 1 Column\n- Column 1: ' + cSummaries.join(' | ')).slice(0, 4000);
            }
        }

        var rawEl = preview.wrapperElement || (preview.element && preview.element[0]) || preview.element;
        if (rawEl) {
            return ($(rawEl).text() || '').trim().slice(0, 4000);
        }

        return '';
    }

    function getPrimaryStageInstance() {
        var ids = Object.keys(instancesByStageId);
        for (var i = 0; i < ids.length; i++) {
            var inst = instancesByStageId[ids[i]];
            if (inst && inst.pageBuilder && inst.pageBuilder.stage && inst.pageBuilder.stage.rootContainer) {
                return inst;
            }
        }
        return null;
    }

    function getWholeStageStructureSummary() {
        var lines = [],
            pageTitle = ($('input[name="title"]').val() || '').trim();

        if (pageTitle) {
            lines.push('Page Title: "' + pageTitle + '"');
        }

        var inst = getPrimaryStageInstance();
        if (!inst || !inst.pageBuilder || !inst.pageBuilder.stage || !inst.pageBuilder.stage.rootContainer) {
            return lines.join('\n');
        }

        var rootCt = inst.pageBuilder.stage.rootContainer,
            topChildren = typeof rootCt.getChildren === 'function' ? (rootCt.getChildren()() || []) : [],
            rowCts = topChildren.filter(function (ch) {
                return normalizeType(ch && ch.config && ch.config.name) === 'row';
            });

        if (!rowCts.length) {
            return lines.join('\n');
        }

        lines.push('Current Page Stage Structure: ' + rowCts.length + ' Row(s)');
        rowCts.forEach(function (rCt, idx) {
            var rowSummary = getPreviewContextContent({ contentType: rCt }) || '[Empty Row]';
            lines.push('Row #' + (idx + 1) + ':\n' + rowSummary);
        });

        return lines.join('\n').slice(0, 5000);
    }

    function expandContentSectionIfCollapsed() {
        var $contentFieldset = $('.fieldset-wrapper[data-index="content"]').first();
        if ($contentFieldset.length) {
            var $titleBar = $contentFieldset.children('.fieldset-wrapper-title').first();
            if ($titleBar.attr('data-state-collapsible') === 'closed') {
                $titleBar.trigger('click');
            }
        }
    }

    function ensurePrimaryStageReady() {
        expandContentSectionIfCollapsed();

        var existing = getPrimaryStageInstance();
        if (existing) {
            return Promise.resolve(existing);
        }

        return new Promise(function (resolve, reject) {
            var attempts = 0,
                maxAttempts = 70;

            var timer = setInterval(function () {
                attempts++;
                expandContentSectionIfCollapsed();

                var readyInst = getPrimaryStageInstance();
                if (readyInst) {
                    clearInterval(timer);
                    resolve(readyInst);
                    return;
                }

                if (attempts === 4 && typeof window.require === 'function') {
                    try {
                        window.require(['uiRegistry'], function (registry) {
                            if (!registry) {
                                return;
                            }
                            registry.filter(function (comp) {
                                return comp && typeof comp.initPageBuilder === 'function';
                            }).forEach(function (comp) {
                                if (typeof comp.isComponentInitialized === 'function' && !comp.isComponentInitialized()) {
                                    comp.initPageBuilder();
                                }
                            });
                        });
                    } catch (e) {
                        // Ignore registry lookup errors
                    }
                }

                if (attempts >= maxAttempts) {
                    clearInterval(timer);
                    reject(new Error($t('Page Builder stage is still initializing. Please expand the Content section and try again.')));
                }
            }, 120);
        });
    }

    function resolveInjectFieldForPreview(preview) {
        var type = getPreviewContentTypeName(preview),
            directMap = {
                text: 'content',
                html: 'html',
                heading: 'heading_text',
                banner: 'message',
                slide: 'content',
                'button-item': 'button_text',
                button_item: 'button_text',
                image: 'image_caption',
                block: 'html',
                products: 'html'
            };

        if (directMap[type]) {
            return directMap[type];
        }

        var state = (preview && preview.contentType && preview.contentType.dataStore)
            ? (preview.contentType.dataStore.getState() || {})
            : {};

        var candidates = ['content', 'html', 'message', 'heading_text', 'button_text', 'image_caption'];
        for (var i = 0; i < candidates.length; i++) {
            if (Object.prototype.hasOwnProperty.call(state, candidates[i])) {
                return candidates[i];
            }
        }

        return null;
    }

    function findInjectableDescendantContentType(contentType) {
        if (!contentType || typeof contentType.getChildren !== 'function') {
            return null;
        }

        var children = contentType.getChildren()() || [],
            preferredTypes = ['html', 'text', 'heading', 'banner', 'slide'];

        for (var i = 0; i < children.length; i++) {
            var child = children[i],
                childType = normalizeType(child && child.config && child.config.name);

            if (preferredTypes.indexOf(childType) !== -1 && child.preview) {
                var childKey = resolveInjectFieldForPreview(child.preview);
                if (childKey) {
                    return { preview: child.preview, key: childKey, label: child.config.label || childType };
                }
            }

            var nested = findInjectableDescendantContentType(child);
            if (nested) {
                return nested;
            }
        }

        return null;
    }

    function injectAiResponseIntoPreview(preview, responseText) {
        var key = resolveInjectFieldForPreview(preview);

        if (key) {
            if (typeof preview.updateData === 'function') {
                preview.updateData(key, responseText);
                return { success: true, key: key };
            }

            if (preview && preview.contentType && preview.contentType.dataStore) {
                preview.contentType.dataStore.set(key, responseText);
                return { success: true, key: key };
            }
        }

        if (preview && preview.contentType) {
            var descendant = findInjectableDescendantContentType(preview.contentType);
            if (descendant && descendant.preview) {
                if (typeof descendant.preview.updateData === 'function') {
                    descendant.preview.updateData(descendant.key, responseText);
                    return { success: true, key: descendant.label + ' (' + descendant.key + ')' };
                }
                if (descendant.preview.contentType && descendant.preview.contentType.dataStore) {
                    descendant.preview.contentType.dataStore.set(descendant.key, responseText);
                    return { success: true, key: descendant.label + ' (' + descendant.key + ')' };
                }
            }
        }

        return {
            success: false,
            message: $t('This container (%1) has no Text, Heading, Banner, or HTML child block yet. Add a Text or HTML Code block inside this Row to inject directly.').replace(
                '%1',
                getPreviewContentTypeName(preview) || 'container'
            )
        };
    }

    function closeAiModal() {
        $('.rb-collab-ai-modal').remove();
    }

    function formatAiPlanBadgeHtml() {
        var plan = normalizeType(aiUsageState.plan || 'trial'),
            credits = aiUsageState.credits_remaining;

        if (plan === 'pro' || plan === 'active' || plan === 'growth') {
            return '<span class="rb-collab-ai-plan-badge is-pro">&#10022; ' +
                escapeHtml($t('AI Pro')) +
                (credits !== null && credits !== undefined ? ' &bull; ' + escapeHtml(String(credits)) + ' ' + escapeHtml($t('credits')) : '') +
                '</span>';
        }

        var creditText = (credits !== null && credits !== undefined)
            ? ' &bull; ' + escapeHtml(String(credits)) + ' ' + escapeHtml($t('credits'))
            : '';

        return '<span class="rb-collab-ai-plan-badge is-trial">&#10022; ' +
            escapeHtml($t('Cloud Trial')) + creditText + '</span>';
    }

    function serializeThreadMessages(thread) {
        if (!thread) {
            return [];
        }

        var items = [
            {
                author: thread.author_name || thread.author_username || 'Admin',
                text: thread.comment_text || ''
            }
        ];

        if (Array.isArray(thread.replies)) {
            thread.replies.forEach(function (reply) {
                items.push({
                    author: reply.author_name || reply.author_username || 'Teammate',
                    text: reply.comment_text || ''
                });
            });
        }

        return items;
    }

    function createLeafBlockInContainer(containerContentType, blockSpec, stageId) {
        var rawType = normalizeType(blockSpec && blockSpec.type) || 'text';

        if (rawType === 'heading') {
            var headingCfg = pbConfig.getContentTypeConfig('heading');
            if (!headingCfg) {
                return Promise.resolve(null);
            }
            return contentTypeFactory(headingCfg, containerContentType, stageId, {
                heading_type: blockSpec.heading_type || 'h2',
                heading_text: blockSpec.heading_text || 'Section Heading'
            }).then(function (headingCt) {
                if (headingCt) {
                    containerContentType.addChild(headingCt);
                }
                return headingCt;
            });
        }

        if (rawType === 'buttons' || rawType === 'button' || rawType === 'button-item') {
            var buttonsCfg = pbConfig.getContentTypeConfig('buttons'),
                buttonItemCfg = pbConfig.getContentTypeConfig('button-item');

            if (!buttonsCfg || !buttonItemCfg) {
                return Promise.resolve(null);
            }

            return contentTypeFactory(buttonsCfg, containerContentType, stageId, {}).then(function (buttonsCt) {
                if (!buttonsCt) {
                    return null;
                }
                containerContentType.addChild(buttonsCt);

                var btnSpecs = Array.isArray(blockSpec.buttons) && blockSpec.buttons.length
                    ? blockSpec.buttons
                    : [{
                        button_text: blockSpec.button_text || 'Shop Now',
                        button_type: blockSpec.button_type || 'primary'
                    }];

                var btnChain = Promise.resolve();
                btnSpecs.forEach(function (bItem) {
                    btnChain = btnChain.then(function () {
                        return contentTypeFactory(buttonItemCfg, buttonsCt, stageId, {
                            button_text: bItem.button_text || 'Shop Now',
                            button_type: mapMagentoButtonType(bItem.button_type)
                        }).then(function (btnItemCt) {
                            if (btnItemCt) {
                                buttonsCt.addChild(btnItemCt);
                            }
                        });
                    });
                });

                return btnChain.then(function () {
                    return buttonsCt;
                });
            });
        }

        if (rawType === 'tabs' && Array.isArray(blockSpec.tabs) && blockSpec.tabs.length) {
            var tabsCfg = pbConfig.getContentTypeConfig('tabs');
            if (!tabsCfg) {
                return Promise.resolve(null);
            }
            return contentTypeFactory(tabsCfg, containerContentType, stageId, {}).then(function (tabsCt) {
                if (!tabsCt) {
                    return null;
                }
                containerContentType.addChild(tabsCt);
                return populateTabsContainer(tabsCt, blockSpec.tabs, true, stageId).then(function () {
                    return tabsCt;
                });
            });
        }

        if (rawType === 'banner') {
            var bannerCfg = pbConfig.getContentTypeConfig('banner');
            if (!bannerCfg) {
                return Promise.resolve(null);
            }
            return contentTypeFactory(bannerCfg, containerContentType, stageId, {
                message: blockSpec.text_content || '<p>Featured Offer</p>',
                button_text: blockSpec.button_text || 'Shop Now',
                show_button: 'always'
            }).then(function (bannerCt) {
                if (bannerCt) {
                    containerContentType.addChild(bannerCt);
                }
                return bannerCt;
            });
        }

        if (rawType === 'divider') {
            var dividerCfg = pbConfig.getContentTypeConfig('divider');
            if (!dividerCfg) {
                return Promise.resolve(null);
            }
            return contentTypeFactory(dividerCfg, containerContentType, stageId, {}).then(function (dividerCt) {
                if (dividerCt) {
                    containerContentType.addChild(dividerCt);
                }
                return dividerCt;
            });
        }

        if (rawType === 'html') {
            var htmlCfg = pbConfig.getContentTypeConfig('html');
            if (!htmlCfg) {
                return Promise.resolve(null);
            }
            return contentTypeFactory(htmlCfg, containerContentType, stageId, {
                html: blockSpec.html_code || blockSpec.text_content || ''
            }).then(function (htmlCt) {
                if (htmlCt) {
                    containerContentType.addChild(htmlCt);
                }
                return htmlCt;
            });
        }

        var textCfg = pbConfig.getContentTypeConfig('text');
        if (!textCfg) {
            return Promise.resolve(null);
        }

        return contentTypeFactory(textCfg, containerContentType, stageId, {
            content: blockSpec.text_content || '<p>Content block copy.</p>'
        }).then(function (textCt) {
            if (textCt) {
                containerContentType.addChild(textCt);
            }
            return textCt;
        });
    }

    function populateBlocksSequentially(containerContentType, blocks, stageId) {
        var chain = Promise.resolve(),
            createdCount = 0;

        (blocks || []).forEach(function (blockSpec) {
            chain = chain.then(function () {
                return createLeafBlockInContainer(containerContentType, blockSpec, stageId).then(function (created) {
                    if (created) {
                        createdCount++;
                    }
                });
            });
        });

        return chain.then(function () {
            return createdCount;
        });
    }

    function populateTabsContainer(tabsCt, tabsSpecArray, replaceExisting, stageId) {
        var tabItemCfg = pbConfig.getContentTypeConfig('tab-item');
        if (!tabsCt || !tabItemCfg) {
            return Promise.resolve({ createdTabs: 0, createdBlocks: 0 });
        }

        if (replaceExisting && typeof tabsCt.getChildren === 'function') {
            var oldTabs = [].concat(tabsCt.getChildren()() || []);
            oldTabs.forEach(function (oldTab) {
                tabsCt.removeChild(oldTab);
            });
        }

        var chain = Promise.resolve(),
            createdTabs = 0,
            createdBlocks = 0;

        (tabsSpecArray || []).forEach(function (tabSpec, idx) {
            chain = chain.then(function () {
                var tabName = (tabSpec && tabSpec.tab_name) ? tabSpec.tab_name : ($t('Tab') + ' ' + (idx + 1));
                return contentTypeFactory(tabItemCfg, tabsCt, stageId, {
                    tab_name: tabName
                }).then(function (tabItemCt) {
                    if (!tabItemCt) {
                        return;
                    }
                    tabsCt.addChild(tabItemCt, idx);
                    tabItemCt.dataStore.set('tab_name', tabName);
                    createdTabs++;

                    return populateBlocksSequentially(tabItemCt, tabSpec.blocks || [], stageId).then(function (cnt) {
                        createdBlocks += cnt;
                        events.trigger('tab-item:mountAfter', {
                            id: tabItemCt.id,
                            contentType: tabItemCt
                        });
                    });
                });
            });
        });

        return chain.then(function () {
            if (tabsCt.preview && typeof tabsCt.preview.updateTabNamesInDataStore === 'function') {
                tabsCt.preview.updateTabNamesInDataStore();
            }
            if (tabsCt.preview && typeof tabsCt.preview.buildTabs === 'function') {
                _.defer(function () {
                    tabsCt.preview.buildTabs(0);
                });
            }
            events.trigger('stage:updateAfter', { stageId: stageId });
            return { createdTabs: createdTabs, createdBlocks: createdBlocks };
        });
    }

    function populateSliderContainer(sliderCt, slidesSpecArray, replaceExisting, stageId) {
        var slideCfg = pbConfig.getContentTypeConfig('slide');
        if (!sliderCt || !slideCfg) {
            return Promise.resolve(0);
        }

        if (replaceExisting && typeof sliderCt.getChildren === 'function') {
            var oldSlides = [].concat(sliderCt.getChildren()() || []);
            oldSlides.forEach(function (s) {
                sliderCt.removeChild(s);
            });
        }

        var chain = Promise.resolve(),
            createdSlides = 0;

        (slidesSpecArray || []).forEach(function (slideSpec, idx) {
            chain = chain.then(function () {
                var headingHtml = slideSpec.heading_text ? ('<h2>' + escapeHtml(slideSpec.heading_text) + '</h2>') : '',
                    bodyHtml = slideSpec.text_content || '<p>Featured slide</p>';

                return contentTypeFactory(slideCfg, sliderCt, stageId, {
                    content: headingHtml + bodyHtml,
                    button_text: slideSpec.button_text || 'Shop Now',
                    show_button: 'always'
                }).then(function (slideCt) {
                    if (slideCt) {
                        sliderCt.addChild(slideCt, idx);
                        createdSlides++;
                    }
                });
            });
        });

        return chain.then(function () {
            if (sliderCt.preview && typeof sliderCt.preview.buildSlick === 'function') {
                _.defer(function () {
                    sliderCt.preview.buildSlick();
                });
            }
            events.trigger('stage:updateAfter', { stageId: stageId });
            return createdSlides;
        });
    }

    function resolveTargetRowOrContainer(contentType) {
        if (!contentType) {
            return null;
        }
        var cursor = contentType;
        while (cursor) {
            var t = normalizeType(cursor.config && cursor.config.name);
            if (
                t === 'tabs' ||
                t === 'tab-item' ||
                t === 'slider' ||
                t === 'buttons' ||
                t === 'column' ||
                t === 'row' ||
                t === 'column-line' ||
                t === 'column-group'
            ) {
                return cursor;
            }
            cursor = cursor.parentContentType;
        }
        return contentType;
    }

    function buildNativeLayoutBlueprintIntoPreview(preview, blueprint) {
        if (!preview || !preview.contentType || !blueprint) {
            return Promise.resolve({
                success: false,
                message: $t('Invalid layout blueprint or target PageBuilder container.')
            });
        }

        var targetCt = resolveTargetRowOrContainer(preview.contentType),
            targetType = normalizeType(targetCt && targetCt.config && targetCt.config.name),
            stageId = targetCt.stageId,
            tabsList = Array.isArray(blueprint.tabs) ? blueprint.tabs : [],
            slidesList = Array.isArray(blueprint.slides) ? blueprint.slides : [],
            columns = Array.isArray(blueprint.columns) ? blueprint.columns : [];

        // 1. If targeting Tabs or blueprint contains tabs
        if (targetType === 'tabs' || targetType === 'tab-item' || tabsList.length > 0) {
            var tabsContainerCt = targetType === 'tab-item' ? targetCt.parentContentType : targetCt;

            // If user asked for tabs while on a Row or Column, create a new Tabs block inside that container first
            if (normalizeType(tabsContainerCt && tabsContainerCt.config && tabsContainerCt.config.name) !== 'tabs') {
                var tabsCfg = pbConfig.getContentTypeConfig('tabs');
                if (!tabsCfg) {
                    return Promise.resolve({
                        success: false,
                        message: $t('PageBuilder Tabs content type is not available.')
                    });
                }
                return contentTypeFactory(tabsCfg, targetCt, stageId, {}).then(function (newTabsCt) {
                    targetCt.addChild(newTabsCt);
                    return populateTabsContainer(newTabsCt, tabsList, true, stageId).then(function (stats) {
                        return {
                            success: true,
                            summary: $t('Injected %1 native Tab(s) and %2 inner block(s).')
                                .replace('%1', stats.createdTabs)
                                .replace('%2', stats.createdBlocks)
                        };
                    });
                });
            }

            var effectiveTabs = tabsList;
            if (!effectiveTabs.length && columns.length) {
                effectiveTabs = columns.map(function (c, i) {
                    return {
                        tab_name: $t('Tab') + ' ' + (i + 1),
                        blocks: c.blocks || []
                    };
                });
            }

            return populateTabsContainer(
                tabsContainerCt,
                effectiveTabs,
                blueprint.replace_existing !== false,
                stageId
            ).then(function (stats) {
                return {
                    success: true,
                    summary: $t('Injected %1 native Tab(s) and %2 inner block(s) into Tabs.')
                        .replace('%1', stats.createdTabs)
                        .replace('%2', stats.createdBlocks)
                };
            });
        }

        // 2. If targeting Slider or blueprint contains slides
        if (targetType === 'slider' || slidesList.length > 0) {
            return populateSliderContainer(
                targetCt,
                slidesList,
                blueprint.replace_existing !== false,
                stageId
            ).then(function (createdSlides) {
                return {
                    success: true,
                    summary: $t('Injected %1 native Slide(s) into Slider.').replace('%1', createdSlides)
                };
            });
        }

        // 3. If targeting a Buttons container and blueprint contains buttons
        if (targetType === 'buttons') {
            var allBtnItems = [];
            columns.forEach(function (c) {
                (c.blocks || []).forEach(function (b) {
                    if (b.type === 'buttons' && Array.isArray(b.buttons)) {
                        allBtnItems = allBtnItems.concat(b.buttons);
                    } else if (b.button_text) {
                        allBtnItems.push({
                            button_text: b.button_text,
                            button_type: b.button_type || 'primary'
                        });
                    }
                });
            });

            if (allBtnItems.length > 0) {
                var buttonItemCfg = pbConfig.getContentTypeConfig('button-item');
                if (blueprint.replace_existing && typeof targetCt.getChildren === 'function') {
                    [].concat(targetCt.getChildren()() || []).forEach(function (ch) {
                        targetCt.removeChild(ch);
                    });
                }
                var bChain = Promise.resolve(),
                    addedBtns = 0;

                allBtnItems.forEach(function (bSpec) {
                    bChain = bChain.then(function () {
                        return contentTypeFactory(buttonItemCfg, targetCt, stageId, {
                            button_text: bSpec.button_text || 'Shop Now',
                            button_type: mapMagentoButtonType(bSpec.button_type)
                        }).then(function (btnCt) {
                            if (btnCt) {
                                targetCt.addChild(btnCt);
                                addedBtns++;
                            }
                        });
                    });
                });

                return bChain.then(function () {
                    events.trigger('stage:updateAfter', { stageId: stageId });
                    return {
                        success: true,
                        summary: $t('Injected %1 native Button(s).').replace('%1', addedBtns)
                    };
                });
            }
        }

        if (!columns.length) {
            return Promise.resolve({
                success: false,
                message: $t('Blueprint did not contain any columns or blocks to build.')
            });
        }

        var colGroupCfg = pbConfig.getContentTypeConfig('column-group'),
            colLineCfg = pbConfig.getContentTypeConfig('column-line'),
            colCfg = pbConfig.getContentTypeConfig('column');

        // 4. If targeting an existing Column Group or Column Line directly, rebuild/update the columns inside that Column Group
        if (targetType === 'column-group' || targetType === 'column-line') {
            var existingColGroup = targetType === 'column-line' ? targetCt.parentContentType : targetCt;

            if (!colCfg) {
                return Promise.resolve({
                    success: false,
                    message: $t('Magento Page Builder Column configuration is not available on this stage.')
                });
            }

            if (typeof existingColGroup.getChildren === 'function') {
                [].concat(existingColGroup.getChildren()() || []).forEach(function (ch) {
                    existingColGroup.removeChild(ch);
                });
            }

            var groupLinePromise = colLineCfg
                ? contentTypeFactory(colLineCfg, existingColGroup, stageId, { width: '100%' }).then(function (cl) {
                    existingColGroup.addChild(cl);
                    return cl;
                })
                : Promise.resolve(existingColGroup);

            return groupLinePromise.then(function (colParent) {
                var groupColPromises = columns.map(function (colSpec) {
                    return contentTypeFactory(colCfg, colParent, stageId, {
                        width: colSpec.width || '50%'
                    });
                });

                return Promise.all(groupColPromises).then(function (createdCols) {
                    var blkChain = Promise.resolve(),
                        totalCreated = 0;

                    createdCols.forEach(function (colCt, idx) {
                        if (!colCt) {
                            return;
                        }
                        colParent.addChild(colCt, idx);
                        var colBlocks = (columns[idx] && columns[idx].blocks) || [];
                        blkChain = blkChain.then(function () {
                            return populateBlocksSequentially(colCt, colBlocks, stageId).then(function (cnt) {
                                totalCreated += cnt;
                            });
                        });
                    });

                    return blkChain.then(function () {
                        events.trigger('contentType:mountAfter', {
                            id: existingColGroup.id,
                            contentType: existingColGroup
                        });
                        events.trigger('stage:updateAfter', { stageId: stageId });

                        return {
                            success: true,
                            summary: $t('Updated Column Group with %1 native Column(s) (%2) and %3 block(s).')
                                .replace('%1', createdCols.length)
                                .replace('%2', columns.map(function (c) { return c.width; }).join(' / '))
                                .replace('%3', totalCreated)
                        };
                    });
                });
            });
        }

        if (blueprint.replace_existing !== false && typeof targetCt.getChildren === 'function') {
            var existingChildren = [].concat(targetCt.getChildren()() || []);
            existingChildren.forEach(function (child) {
                targetCt.removeChild(child);
            });
        }

        // If the user triggered from a single Column (or leaf inside a Column) and only 1 column is in the blueprint, append blocks directly to that Column
        if ((targetType === 'column' || targetType === 'tab-item') && columns.length === 1) {
            return populateBlocksSequentially(targetCt, columns[0].blocks || [], stageId).then(function (blockCount) {
                events.trigger('stage:updateAfter', { stageId: stageId });
                return {
                    success: true,
                    summary: $t('Added %1 native block(s) into %2.').replace('%1', blockCount).replace('%2', targetType)
                };
            });
        }

        // If triggered on a Column/leaf but building multiple columns, step up to the parent Row
        var rowCt = targetCt;
        while (rowCt && normalizeType(rowCt.config && rowCt.config.name) !== 'row' && rowCt.parentContentType) {
            rowCt = rowCt.parentContentType;
        }
        if (!rowCt || typeof rowCt.addChild !== 'function') {
            rowCt = targetCt;
        }

        if (!colGroupCfg || !colCfg) {
            return Promise.resolve({
                success: false,
                message: $t('Magento Page Builder Column configuration is not available on this stage.')
            });
        }

        return contentTypeFactory(colGroupCfg, rowCt, stageId, {
            grid_size: 12
        }).then(function (columnGroup) {
            if (!columnGroup) {
                throw new Error('Unable to create column-group');
            }
            rowCt.addChild(columnGroup);

            var linePromise = colLineCfg
                ? contentTypeFactory(colLineCfg, columnGroup, stageId, { width: '100%' }).then(function (columnLine) {
                    columnGroup.addChild(columnLine);
                    return columnLine;
                })
                : Promise.resolve(columnGroup);

            return linePromise.then(function (columnParent) {
                var colPromises = columns.map(function (colSpec) {
                    return contentTypeFactory(colCfg, columnParent, stageId, {
                        width: colSpec.width || '50%'
                    });
                });

                return Promise.all(colPromises).then(function (createdColumns) {
                    var blockChain = Promise.resolve(),
                        totalBlocksCreated = 0;

                    createdColumns.forEach(function (colCt, idx) {
                        if (!colCt) {
                            return;
                        }
                        columnParent.addChild(colCt, idx);

                        var colBlocks = (columns[idx] && columns[idx].blocks) || [];
                        blockChain = blockChain.then(function () {
                            return populateBlocksSequentially(colCt, colBlocks, stageId).then(function (cnt) {
                                totalBlocksCreated += cnt;
                            });
                        });
                    });

                    return blockChain.then(function () {
                        events.trigger('contentType:mountAfter', {
                            id: columnGroup.id,
                            contentType: columnGroup
                        });
                        events.trigger('stage:updateAfter', { stageId: stageId });

                        return {
                            success: true,
                            summary: $t('Built %1 native Column(s) (%2) and %3 block(s) on the stage.')
                                .replace('%1', createdColumns.length)
                                .replace('%2', columns.map(function (c) { return c.width; }).join(' / '))
                                .replace('%3', totalBlocksCreated)
                        };
                    });
                });
            });
        }).catch(function (err) {
            return {
                success: false,
                message: (err && err.message) ? err.message : $t('Failed to build native PageBuilder columns.')
            };
        });
    }

    function buildNativePageBlueprintIntoStage(stageId, pageBlueprint, replaceExistingStage) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState || !instanceState.pageBuilder || !instanceState.pageBuilder.stage || !instanceState.pageBuilder.stage.rootContainer) {
            return Promise.resolve({
                success: false,
                message: $t('Page Builder stage is not ready yet.')
            });
        }

        var rootContainer = instanceState.pageBuilder.stage.rootContainer,
            rowCfg = pbConfig.getContentTypeConfig('row'),
            rowsList = (pageBlueprint && Array.isArray(pageBlueprint.rows)) ? pageBlueprint.rows : [];

        if (!rowsList.length && pageBlueprint && (Array.isArray(pageBlueprint.columns) || Array.isArray(pageBlueprint.tabs) || Array.isArray(pageBlueprint.slides))) {
            rowsList = [pageBlueprint];
        }

        if (!rowCfg || !rowsList.length) {
            return Promise.resolve({
                success: false,
                message: $t('No Page Builder rows were found in the blueprint.')
            });
        }

        if (replaceExistingStage !== false && typeof rootContainer.getChildren === 'function') {
            var existingRows = [].concat(rootContainer.getChildren()() || []);
            existingRows.forEach(function (child) {
                rootContainer.removeChild(child);
            });
        }

        if (pageBlueprint && pageBlueprint.suggested_page_title) {
            var $titleInput = $('input[name="title"]');
            if ($titleInput.length && !($titleInput.val() || '').trim()) {
                $titleInput.val(pageBlueprint.suggested_page_title).trigger('change');
            }
        }

        var rowChain = Promise.resolve(),
            builtRowCount = 0;

        rowsList.forEach(function (rowSpec) {
            rowChain = rowChain.then(function () {
                return contentTypeFactory(rowCfg, rootContainer, stageId, {}).then(function (newRowCt) {
                    if (!newRowCt) {
                        return;
                    }
                    rootContainer.addChild(newRowCt);
                    builtRowCount++;

                    var singleRowSpec = $.extend({}, rowSpec, { replace_existing: true });
                    return buildNativeLayoutBlueprintIntoPreview({ contentType: newRowCt }, singleRowSpec);
                });
            });
        });

        return rowChain.then(function () {
            walkAndAttachStageTree(rootContainer);
            events.trigger('stage:updateAfter', { stageId: stageId });
            refreshAllBadgesForStage(stageId);

            return {
                success: true,
                summary: $t('Scaffolded %1 native Row(s) onto the Page Builder stage.').replace('%1', builtRowCount)
            };
        }).catch(function (err) {
            return {
                success: false,
                message: (err && err.message) ? err.message : $t('Failed to scaffold page rows.')
            };
        });
    }

    function renderBlueprintBlockSnippet(b) {
        var bType = (b.type || 'text').toUpperCase(),
            previewSnippet = '';

        if (b.type === 'buttons' && Array.isArray(b.buttons) && b.buttons.length) {
            previewSnippet = b.buttons.map(function (btn) { return btn.button_text; }).join(', ');
        } else {
            previewSnippet = b.heading_text || b.button_text || (b.text_content || '').replace(/<[^>]+>/g, '');
        }

        return '<div style="font-size:11px;padding:3px 5px;margin-bottom:3px;background:#f1f5f9;border-radius:3px;">' +
            '<strong>[' + escapeHtml(bType) + ']</strong> ' +
            escapeHtml(String(previewSnippet).slice(0, 64)) +
            '</div>';
    }

    function renderSingleRowBlueprintGridHtml(rowBlueprint) {
        var tabs = Array.isArray(rowBlueprint.tabs) ? rowBlueprint.tabs : [],
            slides = Array.isArray(rowBlueprint.slides) ? rowBlueprint.slides : [],
            cols = Array.isArray(rowBlueprint.columns) ? rowBlueprint.columns : [],
            out = '<div class="rb-collab-blueprint-grid" style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">';

        if (tabs.length) {
            tabs.forEach(function (tab, idx) {
                var blocks = Array.isArray(tab.blocks) ? tab.blocks : [];
                out += '<div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #cbd5e1;border-radius:5px;padding:7px;">' +
                    '<div style="font-weight:700;font-size:11px;color:#0d66d0;margin-bottom:4px;">' +
                    escapeHtml($t('Tab %1: %2').replace('%1', idx + 1).replace('%2', tab.tab_name || '')) +
                    '</div>';
                blocks.forEach(function (b) {
                    out += renderBlueprintBlockSnippet(b);
                });
                out += '</div>';
            });
            out += '</div>';
            return out;
        }

        if (slides.length) {
            slides.forEach(function (slide, idx) {
                out += '<div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #cbd5e1;border-radius:5px;padding:7px;">' +
                    '<div style="font-weight:700;font-size:11px;color:#0d66d0;margin-bottom:4px;">' +
                    escapeHtml($t('Slide %1: %2').replace('%1', idx + 1).replace('%2', slide.heading_text || '')) +
                    '</div>' +
                    renderBlueprintBlockSnippet({ type: 'text', text_content: slide.text_content }) +
                    renderBlueprintBlockSnippet({ type: 'buttons', button_text: slide.button_text }) +
                    '</div>';
            });
            out += '</div>';
            return out;
        }

        cols.forEach(function (col, idx) {
            var blocks = Array.isArray(col.blocks) ? col.blocks : [];
            out += '<div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #cbd5e1;border-radius:5px;padding:7px;">' +
                '<div style="font-weight:700;font-size:11px;color:#0d66d0;margin-bottom:4px;">' +
                escapeHtml($t('Column %1 (%2)').replace('%1', idx + 1).replace('%2', col.width || '50%')) +
                '</div>';

            blocks.forEach(function (b) {
                out += renderBlueprintBlockSnippet(b);
            });

            out += '</div>';
        });

        out += '</div>';
        return out;
    }

    function renderBlueprintPreviewHtml(blueprint) {
        if (!blueprint) {
            return '';
        }

        var rows = Array.isArray(blueprint.rows) ? blueprint.rows : [],
            out = '<div class="rb-collab-ai-result is-layout">' +
                '<div class="rb-collab-ai-result-label">&#9889; ' +
                escapeHtml(blueprint.summary || $t('Native PageBuilder Layout Blueprint Ready')) +
                '</div>';

        if (blueprint.suggested_page_title) {
            out += '<div class="rb-collab-scaffolder-suggested-title">' +
                '<strong>' + escapeHtml($t('Suggested Page Title:')) + '</strong> ' +
                escapeHtml(blueprint.suggested_page_title) +
                '</div>';
        }

        if (rows.length) {
            out += '<div class="rb-collab-scaffolder-rows-stack">';
            rows.forEach(function (rowItem, rIdx) {
                var rTitle = rowItem.row_title || $t('Row #%1').replace('%1', rIdx + 1),
                    rLayout = (rowItem.layout_type || 'columns').toUpperCase();
                out += '<div class="rb-collab-scaffolder-row-card">' +
                    '<div class="rb-collab-scaffolder-row-header">' +
                    '<span class="rb-collab-target-pill">' + escapeHtml($t('ROW %1').replace('%1', rIdx + 1)) + '</span>' +
                    '<strong>' + escapeHtml(rTitle) + '</strong>' +
                    '<span class="rb-collab-scaffolder-row-meta">' + escapeHtml(rLayout) + '</span>' +
                    '</div>' +
                    renderSingleRowBlueprintGridHtml(rowItem) +
                    '</div>';
            });
            out += '</div></div>';
            return out;
        }

        out += renderSingleRowBlueprintGridHtml(blueprint) + '</div>';
        return out;
    }

    function openAiModalForPreview(preview, initialPrompt, initialMode, threadContext) {
        if (!preview || !isAiEnabledForPreview(preview)) {
            return;
        }

        closePopover();
        closeAiModal();

        var identity = resolvePreviewIdentity(preview, false),
            blockType = identity.targetType,
            stageId = preview.contentType && preview.contentType.stageId,
            sessionKey = (stageId || 'stage') + ':' + (identity.targetId || identity.structuralPath || 'root'),
            savedSession = aiSessionsByTargetKey[sessionKey] || {
                turns: [],
                draftPrompt: '',
                lastResponseText: '',
                lastBlueprint: null,
                lastResolvedMode: 'auto'
            },
            lastResponseText = savedSession.lastResponseText || '',
            lastBlueprint = savedSession.lastBlueprint || null,
            lastResolvedMode = savedSession.lastResolvedMode || 'auto',
            instanceState = instancesByStageId[stageId],
            $anchor = findBadgeMountTarget(preview, preview.wrapperElement),
            $container = instanceState && instanceState.$stageWrapper && instanceState.$stageWrapper.hasClass('stage-full-screen')
                ? instanceState.$stageWrapper
                : $('body'),
            commentThreadMessages = threadContext && threadContext.thread
                ? serializeThreadMessages(threadContext.thread)
                : [],
            threadIdToResolve = threadContext && threadContext.thread
                ? parseInt(threadContext.thread.comment_id, 10)
                : null;

        aiSessionsByTargetKey[sessionKey] = savedSession;

        var $modal = $('<div></div>', { class: 'rb-collab-ai-modal' });

        var html = '<div class="rb-collab-ai-header">' +
            '<div class="rb-collab-ai-title-wrap">' +
            renderSolcartMarkSvg(18) +
            '<span class="rb-collab-target-pill">' + escapeHtml(identity.targetType.toUpperCase()) + '</span>' +
            '<strong>' + escapeHtml($t('Solcart AI Assistant')) + '</strong>' +
            '</div>' +
            '<div class="rb-collab-ai-header-right">' +
            '<span class="rb-collab-ai-plan-slot">' + formatAiPlanBadgeHtml() + '</span>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-ai-clear-session" title="' +
            escapeHtml($t('Reset conversation for this element')) + '"' +
            (savedSession.turns.length ? '' : ' style="display:none;"') + '>&#8634;</button>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-ai-close" title="' + escapeHtml($t('Close')) + '">&times;</button>' +
            '</div>' +
            '</div>';

        var scaffoldChipsHtml = '';
        if (blockType === 'tabs' || blockType === 'tab-item') {
            scaffoldChipsHtml =
                '<button type="button" class="rb-collab-ai-chip" data-prompt="Create 3 product showcase tabs, each with a heading, persuasive description, and a primary CTA button.">' +
                '&#9889; ' + escapeHtml($t('3 Product Tabs + CTAs')) + '</button>' +
                '<button type="button" class="rb-collab-ai-chip" data-prompt="Create 3 informational tabs: Overview, Specifications, and Shipping & Returns, each with clear copy and a CTA button.">' +
                '&#9889; ' + escapeHtml($t('Overview / Specs / Shipping Tabs')) + '</button>';
        } else if (blockType === 'slider' || blockType === 'slide') {
            scaffoldChipsHtml =
                '<button type="button" class="rb-collab-ai-chip" data-prompt="Create 3 promotional hero slides with headlines, value proposition copy, and Shop Now buttons.">' +
                '&#9889; ' + escapeHtml($t('3 Hero Slides')) + '</button>';
        } else {
            scaffoldChipsHtml =
                '<button type="button" class="rb-collab-ai-chip" data-prompt="Fill this row with 2 equal 50% columns, each containing a heading, descriptive copy, and a CTA button.">' +
                '&#9889; ' + escapeHtml($t('2 Equal Columns (50/50)')) + '</button>' +
                '<button type="button" class="rb-collab-ai-chip" data-prompt="Build 3 equal columns (33.33% each) for a feature showcase, each with a heading, short benefit paragraph, and button.">' +
                '&#9889; ' + escapeHtml($t('3-Column Features')) + '</button>' +
                '<button type="button" class="rb-collab-ai-chip" data-prompt="Build 4 equal columns (25% each) showcasing 4 key store categories with headings, descriptions, and Shop buttons.">' +
                '&#9889; ' + escapeHtml($t('4-Column Grid')) + '</button>';
        }

        html += '<div class="rb-collab-ai-body">' +
            '<div class="rb-collab-ai-quick-chips">' +
            scaffoldChipsHtml +
            '<button type="button" class="rb-collab-ai-chip" data-prompt="Improve the copy in this block to be clearer and more persuasive.">' +
            escapeHtml($t('Improve Copy')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-prompt="Critique this block and suggest 3 conversion improvements.">' +
            escapeHtml($t('Conversion Audit')) + '</button>' +
            '</div>' +
            '<textarea class="rb-collab-ai-input" rows="4" placeholder="' +
            escapeHtml($t('Describe what to generate, build, or analyze for %1...').replace('%1', identity.targetLabel)) +
            '"></textarea>' +
            '<div class="rb-collab-ai-response-wrap">' +
            '<div class="rb-collab-ai-loading-facade"><div class="rb-collab-ai-pulse"></div>' +
            '<span>' + escapeHtml($t('Contacting Solcart AI...')) + '</span></div>' +
            '<div class="rb-collab-ai-response" aria-live="polite"></div>' +
            '</div>' +
            '<div class="rb-collab-ai-actions">' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-ai-cancel">' +
            escapeHtml($t('Cancel')) + '</button>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-ai-inject" disabled>' +
            escapeHtml($t('Inject')) + '</button>' +
            (threadIdToResolve && runtimeConfig.permissions.resolve
                ? '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-ai-inject-resolve" disabled>&#10003; ' +
                  escapeHtml($t('Inject & Resolve')) + '</button>'
                : '') +
            '<button type="button" class="rb-collab-btn rb-collab-btn-primary rb-collab-ai-submit">&#10022; ' +
            escapeHtml($t('Send')) + '</button>' +
            '</div>' +
            '</div>';

        $modal.html(html);

        if (initialPrompt && typeof initialPrompt === 'string') {
            $modal.find('.rb-collab-ai-input').val(initialPrompt);
            savedSession.draftPrompt = initialPrompt;
        } else if (savedSession.draftPrompt) {
            $modal.find('.rb-collab-ai-input').val(savedSession.draftPrompt);
        }

        $container.append($modal);
        positionPopover($modal, $anchor, $container);

        if (savedSession.turns && savedSession.turns.length) {
            renderAiOutput(lastResponseText, lastResolvedMode, lastBlueprint);
            var canInjectSaved = (lastResolvedMode === 'layout' && Boolean(lastBlueprint)) ||
                (lastResolvedMode === 'build' && Boolean(lastResponseText.trim()));
            $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', !canInjectSaved);
        }

        function renderConversationHistoryHtml() {
            if (!savedSession.turns || !savedSession.turns.length) {
                return '';
            }

            var histHtml = '<div class="rb-collab-ai-history">';
            savedSession.turns.forEach(function (turn, idx) {
                var isLatest = idx === savedSession.turns.length - 1;
                histHtml += '<div class="rb-collab-ai-turn">' +
                    '<div class="rb-collab-ai-turn-user">' +
                    '<strong>' + escapeHtml($t('You')) + ':</strong> ' + escapeHtml(turn.prompt) +
                    '</div>';

                if (turn.mode === 'layout' && turn.blueprint) {
                    if (isLatest) {
                        histHtml += renderBlueprintPreviewHtml(turn.blueprint);
                    } else {
                        histHtml += '<div class="rb-collab-ai-turn-summary">&#9889; ' +
                            escapeHtml(turn.blueprint.summary || $t('Generated layout blueprint')) +
                            '</div>';
                    }
                } else if (turn.mode === 'build') {
                    histHtml += '<div class="rb-collab-ai-result is-build">' +
                        '<div class="rb-collab-ai-result-label">' + escapeHtml($t('Generated Output (Ready to Inject)')) + '</div>' +
                        '<pre class="rb-collab-ai-result-pre">' + escapeHtml(turn.response || '') + '</pre>' +
                        '</div>';
                } else {
                    histHtml += '<div class="rb-collab-ai-result is-ask">' + escapeHtml(turn.response || '') + '</div>';
                }

                histHtml += '</div>';
            });
            histHtml += '</div>';
            return histHtml;
        }

        function renderAiOutput(text, mode, blueprint) {
            if (savedSession.turns && savedSession.turns.length) {
                var $resp = $modal.find('.rb-collab-ai-response');
                $resp.html(renderConversationHistoryHtml());
                $resp.scrollTop($resp[0].scrollHeight);
                return;
            }
            var escaped = escapeHtml(text || '');
            if (mode === 'layout' && blueprint) {
                $modal.find('.rb-collab-ai-response').html(renderBlueprintPreviewHtml(blueprint));
                return;
            }
            if (mode === 'build') {
                $modal.find('.rb-collab-ai-response').html(
                    '<div class="rb-collab-ai-result is-build">' +
                    '<div class="rb-collab-ai-result-label">' + escapeHtml($t('Generated Output (Ready to Inject)')) + '</div>' +
                    '<pre class="rb-collab-ai-result-pre">' + escaped + '</pre>' +
                    '</div>'
                );
                return;
            }
            $modal.find('.rb-collab-ai-response').html(
                '<div class="rb-collab-ai-result is-ask">' + escaped + '</div>'
            );
        }

        function renderAiError(message, isPaymentRequired, upgradeUrl) {
            if (isPaymentRequired) {
                var portalLink = upgradeUrl
                    ? '<a href="' + escapeHtml(upgradeUrl) + '" target="_blank" rel="noopener" class="action-primary rb-collab-upgrade-btn">' +
                        escapeHtml($t('Manage Subscription / Upgrade')) + '</a>'
                    : '';

                $modal.find('.rb-collab-ai-response').html(
                    '<div class="rb-collab-ai-gate-card">' +
                    '<div class="rb-collab-ai-gate-title">&#128274; ' + escapeHtml($t('AI Subscription Required')) + '</div>' +
                    '<div class="rb-collab-ai-gate-text">' + escapeHtml(message) + '</div>' +
                    portalLink +
                    '</div>'
                );
                return;
            }

            $modal.find('.rb-collab-ai-response').html(
                '<div class="message message-error"><div>' + escapeHtml(message) + '</div></div>'
            );
        }

        $modal.on('input', '.rb-collab-ai-input', function () {
            savedSession.draftPrompt = $(this).val() || '';
        });

        $modal.on('click', '.rb-collab-ai-clear-session', function () {
            savedSession.turns = [];
            savedSession.draftPrompt = '';
            savedSession.lastResponseText = '';
            savedSession.lastBlueprint = null;
            savedSession.lastResolvedMode = 'auto';
            lastResponseText = '';
            lastBlueprint = null;
            lastResolvedMode = 'auto';
            $modal.find('.rb-collab-ai-input').val('');
            $modal.find('.rb-collab-ai-response').empty();
            $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', true);
            $(this).hide();
        });

        $modal.on('click', '.rb-collab-ai-close, .rb-collab-ai-cancel', function () {
            closeAiModal();
        });

        $modal.on('click', '.rb-collab-ai-chip', function () {
            var chipPrompt = $(this).attr('data-prompt') || '';
            savedSession.draftPrompt = chipPrompt;
            $modal.find('.rb-collab-ai-input').val(chipPrompt).trigger('focus');
        });

        $modal.on('click', '.rb-collab-ai-submit', function () {
            var prompt = ($modal.find('.rb-collab-ai-input').val() || '').trim();

            if (!prompt) {
                renderAiError($t('Please enter a prompt.'), false, '');
                return;
            }

            $modal.addClass('is-loading');
            $modal.find('.rb-collab-ai-submit, .rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', true);

            $.ajax({
                url: runtimeConfig.urls.aiChat,
                method: 'POST',
                dataType: 'json',
                data: {
                    form_key: window.FORM_KEY || runtimeConfig.formKey,
                    prompt: prompt,
                    mode: 'auto',
                    context_type: getPreviewContentTypeName(preview),
                    context_content: getPreviewContextContent(preview),
                    comment_thread: commentThreadMessages.length ? JSON.stringify(commentThreadMessages) : '',
                    conversation_history: savedSession.turns.length ? JSON.stringify(savedSession.turns) : ''
                }
            }).done(function (response) {
                if (response && response.usage) {
                    aiUsageState = $.extend({}, aiUsageState, response.usage);
                    $modal.find('.rb-collab-ai-plan-slot').html(formatAiPlanBadgeHtml());
                }

                if (response && response.payment_required) {
                    renderAiError(
                        response.error || $t('Your trial or credit limit has been reached.'),
                        true,
                        (response.usage && response.usage.upgrade_url) || ''
                    );
                    return;
                }

                if (response && response.success === true) {
                    lastResponseText = (response.response || '').toString();
                    lastBlueprint = response.blueprint || null;
                    lastResolvedMode = response.mode || (lastBlueprint ? 'layout' : 'build');

                    savedSession.turns.push({
                        prompt: prompt,
                        mode: lastResolvedMode,
                        response: lastResponseText,
                        blueprint: lastBlueprint
                    });
                    savedSession.lastResponseText = lastResponseText;
                    savedSession.lastBlueprint = lastBlueprint;
                    savedSession.lastResolvedMode = lastResolvedMode;
                    savedSession.draftPrompt = '';
                    $modal.find('.rb-collab-ai-input').val('');
                    $modal.find('.rb-collab-ai-clear-session').show();

                    renderAiOutput(lastResponseText, lastResolvedMode, lastBlueprint);
                    if (lastResolvedMode === 'layout') {
                        $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve')
                            .prop('disabled', !lastBlueprint);
                    } else if (lastResolvedMode === 'build') {
                        $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve')
                            .prop('disabled', lastResponseText.trim() === '');
                    } else {
                        $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve')
                            .prop('disabled', true);
                    }
                    return;
                }

                renderAiError(
                    (response && (response.error || response.message)) || $t('Unable to complete AI request.'),
                    false,
                    ''
                );
            }).fail(function (xhr) {
                var msg = (xhr && xhr.responseJSON && (xhr.responseJSON.error || xhr.responseJSON.message))
                    ? (xhr.responseJSON.error || xhr.responseJSON.message)
                    : $t('Failed to communicate with the AI controller.');
                renderAiError(msg, false, '');
            }).always(function () {
                $modal.removeClass('is-loading');
                $modal.find('.rb-collab-ai-submit').prop('disabled', false);
            });
        });

        function applyCurrentAiResult(resolveThreadAfter) {
            var $resolveBtn = $modal.find('.rb-collab-ai-inject-resolve');

            if (lastResolvedMode === 'layout' && lastBlueprint) {
                $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', true);
                buildNativeLayoutBlueprintIntoPreview(preview, lastBlueprint).then(function (res) {
                    if (res.success) {
                        $modal.find('.rb-collab-ai-response').prepend(
                            '<div class="message message-success"><div>' +
                            escapeHtml(res.summary) +
                            '</div></div>'
                        );
                        if (resolveThreadAfter && threadIdToResolve && stageId) {
                            updateCommentStatus(stageId, threadIdToResolve, 'resolved', $resolveBtn);
                            closeAiModal();
                        }
                        return;
                    }
                    renderAiError(res.message || $t('Failed to build native blocks.'), false, '');
                }).always(function () {
                    $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', false);
                });
                return;
            }

            var res = injectAiResponseIntoPreview(preview, lastResponseText);
            if (res.success) {
                $modal.find('.rb-collab-ai-response').prepend(
                    '<div class="message message-success"><div>' +
                    escapeHtml($t('Injected into %1.').replace('%1', res.key)) +
                    '</div></div>'
                );
                if (resolveThreadAfter && threadIdToResolve && stageId) {
                    updateCommentStatus(stageId, threadIdToResolve, 'resolved', $resolveBtn);
                    closeAiModal();
                }
                return;
            }
            renderAiError(res.message || $t('Injection failed.'), false, '');
        }

        $modal.on('click', '.rb-collab-ai-inject', function () {
            applyCurrentAiResult(false);
        });

        $modal.on('click', '.rb-collab-ai-inject-resolve', function () {
            applyCurrentAiResult(true);
        });
    }

    function findBadgeMountTarget(preview, wrapperElement) {
        var $wrapper = $(wrapperElement),
            type = getPreviewContentTypeName(preview);

        if (type === 'row') {
            var $affordance = $wrapper.find('.pagebuilder-affordance-row').first();
            if ($affordance.length) {
                return $affordance;
            }
        }

        if (type === 'column-group') {
            var $colGroup = $wrapper.hasClass('pagebuilder-column-group')
                ? $wrapper
                : $wrapper.find('> .pagebuilder-column-group').first();
            if ($colGroup.length) {
                return $colGroup;
            }
        }

        return $wrapper;
    }

    function resolveOwnOptionsBox(preview, $root) {
        var type = getPreviewContentTypeName(preview);

        if (type === 'row') {
            var $rowOpt = $root.find('> .pagebuilder-affordance-row > .pagebuilder-row > .pagebuilder-options').first();
            if (!$rowOpt.length) {
                $rowOpt = $root.find('> .pagebuilder-row > .pagebuilder-options').first();
            }
            return $rowOpt;
        }

        var $directOpt = $root.children('.pagebuilder-options').first();
        if (!$directOpt.length) {
            $directOpt = $root.find('> .pagebuilder-content-type > .pagebuilder-options').first();
        }
        return $directOpt;
    }

    function renderPreviewFloatingBadge(preview) {
        if (!preview) {
            return;
        }

        var rawEl = preview.wrapperElement || (preview.element && preview.element[0]) || preview.element;
        if (!rawEl) {
            return;
        }

        var collabEnabled = isEnabledForPreview(preview),
            aiEnabled = isAiEnabledForPreview(preview),
            type = getPreviewContentTypeName(preview);

        if ((!collabEnabled && !aiEnabled) || type === 'column-line') {
            return;
        }

        var contentType = preview.contentType,
            stageId = contentType && contentType.stageId,
            instanceState = instancesByStageId[stageId];

        if (!instanceState) {
            return;
        }

        var $mount = findBadgeMountTarget(preview, rawEl),
            identity = resolvePreviewIdentity(preview, false),
            threads = getThreadsForTarget(instanceState, identity),
            summary = summarizeTargetThreads(threads);

        $mount.attr('data-rb-collab-id', identity.targetId);
        $mount.attr('data-rb-structural-path', identity.structuralPath);

        var $rootEl = $(rawEl),
            $optionsBox = resolveOwnOptionsBox(preview, $rootEl);
        if ($optionsBox && $optionsBox.length) {
            $optionsBox.children('.rb-collab-floating-badge-wrap').remove();
        }
        $mount.children('.rb-collab-floating-badge-wrap').remove();

        $mount.toggleClass('rb-collab-has-open-threads', summary.open > 0);
        $mount.toggleClass('rb-collab-has-resolved-threads', summary.open === 0 && summary.resolved > 0);

        if (!runtimeConfig.enableFloatingPins || !pinsVisible) {
            return;
        }

        var hasSecondaryUploaderMenu = (
            type === 'banner' ||
            type === 'slide' ||
            type === 'image' ||
            $rootEl.find('> .pagebuilder-banner-wrapper > .pagebuilder-image-uploader-container, > .pagebuilder-slide-wrapper > .pagebuilder-image-uploader-container, > .pagebuilder-image-uploader-container').length > 0
        );

        var $badgeWrap = $('<div></div>', {
            class: 'rb-collab-floating-badge-wrap' +
                ($optionsBox && $optionsBox.length ? ' rb-collab-under-options' : ' rb-collab-standalone-badge') +
                (hasSecondaryUploaderMenu ? ' rb-collab-under-stacked-menus' : '') +
                (type === 'row' ? ' rb-collab-floating-badge-row' : ' rb-collab-floating-badge-element') +
                (type === 'column-group' ? ' rb-collab-floating-badge-column-group' : '') +
                (summary.total === 0 ? ' rb-collab-floating-badge-empty' : ' rb-collab-floating-badge-has-threads')
        });

        if (collabEnabled) {
            var statusClass = 'rb-collab-pill-idle';
            if (summary.open > 0) {
                statusClass = summary.mentionedMe ? 'rb-collab-pill-mention' : 'rb-collab-pill-open';
            } else if (summary.resolved > 0) {
                statusClass = 'rb-collab-pill-resolved';
            }

            var badgeText = '';
            if (summary.open > 0) {
                badgeText = '&#128172; ' + summary.open + (summary.mentionedMe ? ' @' : '');
            } else if (summary.resolved > 0) {
                badgeText = '&#10003; ' + summary.resolved;
            } else {
                badgeText = '+ &#128172; ' + escapeHtml($t('Comment'));
            }

            var $pill = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-floating-pill ' + statusClass,
                title: summary.total > 0
                    ? $t('%1 comment thread(s) on %2').replace('%1', summary.total).replace('%2', identity.targetLabel)
                    : $t('Add comment on %1').replace('%1', identity.targetLabel),
                html: badgeText
            });

            $pill.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                openCommentPopoverForPreview(preview);
            });

            $badgeWrap.append($pill);
        }

        if (aiEnabled) {
            var $aiPill = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-floating-pill rb-collab-pill-ai',
                title: $t('Open Solcart AI Assistant on %1').replace('%1', identity.targetLabel),
                html: '&#10022; ' + escapeHtml($t('AI'))
            });

            $aiPill.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                openAiModalForPreview(preview);
            });

            $badgeWrap.append($aiPill);
        }

        if (type === 'column-group') {
            $mount.append($badgeWrap);
        } else if ($optionsBox && $optionsBox.length) {
            $optionsBox.append($badgeWrap);
        } else {
            $mount.append($badgeWrap);
        }
    }

    function refreshAllBadgesForStage(stageId) {
        var previews = previewsByStageId[stageId] || [];

        previews.forEach(function (preview) {
            var rawEl = preview && (preview.wrapperElement || (preview.element && preview.element[0]) || preview.element);
            if (rawEl && $.contains(document.documentElement, rawEl)) {
                renderPreviewFloatingBadge(preview);
            }
        });
    }

    function collectStageRowsForAudit(stageId) {
        var previews = previewsByStageId[stageId] || [],
            rows = [];

        previews.forEach(function (preview) {
            if (!preview || !preview.wrapperElement || !$.contains(document.documentElement, preview.wrapperElement)) {
                return;
            }
            var type = getPreviewContentTypeName(preview);
            if (type !== 'row') {
                return;
            }
            var identity = resolvePreviewIdentity(preview, true),
                content = getPreviewContextContent(preview);

            rows.push({
                target_id: identity.targetId,
                structural_path: identity.structuralPath,
                target_label: identity.targetLabel,
                target_type: 'row',
                content: content || ('[Empty or visual row: ' + identity.targetLabel + ']')
            });
        });

        return rows;
    }

    function runStageAiAudit(stageId, $triggerBtn) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState || !runtimeConfig.urls.aiAudit) {
            return;
        }

        var rows = collectStageRowsForAudit(stageId);
        if (!rows.length) {
            return;
        }

        var originalHtml = $triggerBtn.html();
        $triggerBtn.prop('disabled', true).html('<span>&#10022; ' + escapeHtml($t('Auditing Stage...')) + '</span>');

        $.ajax({
            url: runtimeConfig.urls.aiAudit,
            method: 'POST',
            dataType: 'json',
            data: {
                form_key: window.FORM_KEY || runtimeConfig.formKey,
                instance_key: instanceState.instanceKey,
                entity_type: runtimeConfig.entityType,
                entity_id: runtimeConfig.entityId,
                field_name: instanceState.fieldName,
                page_title: $('input[name="title"]').val() || document.title || '',
                rows: JSON.stringify(rows)
            }
        }).done(function (response) {
            if (response && response.usage) {
                aiUsageState = $.extend({}, aiUsageState, response.usage);
            }

            if (response && response.success && response.data) {
                applyUpdatedPayload(stageId, response.data);
                toggleCollaborationDrawer(stageId, true);
            }
        }).always(function () {
            $triggerBtn.prop('disabled', false).html(originalHtml);
        });
    }

    function renderStageHeaderToolbar(instanceState) {
        if (!instanceState || !instanceState.pageBuilder || !instanceState.pageBuilder.stage) {
            return;
        }

        var stageId = instanceState.stageId,
            $stageEl = $('#' + instanceState.pageBuilder.stage.id),
            $stageWrapper = $stageEl.closest('.pagebuilder-stage-wrapper');

        if (!$stageWrapper.length) {
            return;
        }

        instanceState.$stageWrapper = $stageWrapper;

        var $header = $stageWrapper.find('.pagebuilder-header').first();
        if (!$header.length) {
            return;
        }

        $header.find('.rb-collab-header-bar').remove();

        var counts = (instanceState.counts || {}),
            openThreads = counts.open_threads || 0,
            pageOpen = counts.page_open || 0,
            totalThreads = counts.total_threads || 0;

        var $bar = $('<span></span>', {
            class: 'rb-collab-header-bar',
            'data-stage-id': stageId
        });

        if (runtimeConfig.enablePageComments) {
            var $pageBtn = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-header-btn rb-collab-page-comments-btn' + (pageOpen > 0 ? ' has-open' : ''),
                html: '<span class="rb-collab-btn-icon">&#128196;</span> ' +
                    '<span>' + escapeHtml($t('Page Comments')) + '</span>' +
                    '<span class="rb-collab-count-badge">' + pageOpen + '</span>'
            });

            $pageBtn.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                openPageCommentPopover(stageId, $pageBtn);
            });

            $bar.append($pageBtn);
        }

        var $drawerBtn = $('<button></button>', {
            type: 'button',
            class: 'rb-collab-header-btn rb-collab-drawer-toggle-btn' + (openThreads > 0 ? ' has-open' : ''),
            html: renderSolcartMarkSvg(16) + ' ' +
                '<span>' + escapeHtml($t('StageCraft')) + '</span>' +
                '<span class="rb-collab-count-badge" title="' + escapeHtml($t('Open / Total Threads')) + '">' +
                openThreads + '/' + totalThreads + '</span>'
        });

        $drawerBtn.on('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleCollaborationDrawer(stageId);
        });

        $bar.append($drawerBtn);

        var hasAiMenu = runtimeConfig.ai && runtimeConfig.ai.enabled && runtimeConfig.permissions.ai;
        if (hasAiMenu || runtimeConfig.enableFloatingPins) {
            var $menuWrap = $('<span></span>', {
                class: 'rb-collab-header-dropdown-wrap'
            });

            var $sparkleBtn = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-header-btn rb-collab-header-sparkle-btn',
                title: $t('Solcart AI & StageCraft Controls'),
                html: renderSolcartMarkSvg(14) + ' <span>&#10022; ' + escapeHtml($t('AI')) + ' &#9662;</span>'
            });

            var $dropdownMenu = $('<div></div>', {
                class: 'rb-collab-header-dropdown-menu'
            });

            if (hasAiMenu && runtimeConfig.urls.aiAudit) {
                var $auditItem = $('<button></button>', {
                    type: 'button',
                    class: 'rb-collab-dropdown-item rb-collab-ai-audit-btn',
                    title: $t('Audit stage rows with @AI-Reviewer and post actionable review threads'),
                    html: '<span>&#10022; ' + escapeHtml($t('Run AI Page Audit')) + '</span>'
                });

                $auditItem.on('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    runStageAiAudit(stageId, $auditItem);
                });

                $dropdownMenu.append($auditItem);
            }

            if (hasAiMenu) {
                var $planItem = $('<a></a>', {
                    href: aiUsageState.upgrade_url || '#',
                    target: '_blank',
                    rel: 'noopener',
                    class: 'rb-collab-dropdown-item rb-collab-header-plan-link',
                    title: $t('Manage Solcart AI Subscription & Billing'),
                    html: formatAiPlanBadgeHtml()
                });

                if (!aiUsageState.upgrade_url) {
                    $planItem.on('click', function (event) {
                        event.preventDefault();
                    });
                }

                $dropdownMenu.append($planItem);
            }

            if (runtimeConfig.enableFloatingPins) {
                var $pinsItem = $('<button></button>', {
                    type: 'button',
                    class: 'rb-collab-dropdown-item rb-collab-pins-toggle-btn' + (pinsVisible ? ' is-active' : ''),
                    title: $t('Toggle Floating Stage Comment & AI Badges'),
                    html: '<span>&#128204; ' + escapeHtml(pinsVisible ? $t('Pins: On') : $t('Pins: Off')) + '</span>'
                });

                $pinsItem.on('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    pinsVisible = !pinsVisible;
                    Object.keys(instancesByStageId).forEach(function (sId) {
                        renderStageHeaderToolbar(instancesByStageId[sId]);
                        refreshAllBadgesForStage(sId);
                    });
                });

                $dropdownMenu.append($pinsItem);
            }

            $sparkleBtn.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                $menuWrap.toggleClass('is-open');
            });

            $menuWrap.append($sparkleBtn).append($dropdownMenu);
            $bar.append($menuWrap);
        }

        var $templateButtons = $header.find('.template-buttons');
        if ($templateButtons.length) {
            $bar.insertBefore($templateButtons);
        } else {
            $header.append($bar);
        }

        if ($stageWrapper.find('.rb-collab-drawer').length) {
            renderDrawerContent(instanceState);
        }
    }

    function toggleCollaborationDrawer(stageId, forceOpen) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState || !instanceState.$stageWrapper || !instanceState.$stageWrapper.length) {
            return;
        }

        var $drawer = instanceState.$stageWrapper.find('.rb-collab-drawer');
        if (!$drawer.length) {
            $drawer = $('<div></div>', {
                class: 'rb-collab-drawer',
                'data-stage-id': stageId
            });
            instanceState.$stageWrapper.append($drawer);
            instanceState.drawerFilter = 'all';
        }

        var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !$drawer.hasClass('is-open');
        $drawer.toggleClass('is-open', shouldOpen);

        if (shouldOpen) {
            renderDrawerContent(instanceState);
        }
    }

    function locateAndOpenTargetFromThread(stageId, thread) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState) {
            return;
        }

        if (thread.target_type === 'page' || thread.target_id === 'page') {
            var $btn = instanceState.$stageWrapper
                ? instanceState.$stageWrapper.find('.rb-collab-page-comments-btn')
                : null;
            openPageCommentPopover(stageId, $btn);
            return;
        }

        var previews = previewsByStageId[stageId] || [],
            matchedPreview = null;

        previews.forEach(function (preview) {
            if (matchedPreview || !preview || !preview.wrapperElement) {
                return;
            }
            var identity = resolvePreviewIdentity(preview, false);
            if (thread.target_id && identity.targetId === thread.target_id) {
                matchedPreview = preview;
            } else if (thread.structural_path && identity.structuralPath === thread.structural_path) {
                matchedPreview = preview;
            }
        });

        if (matchedPreview && matchedPreview.wrapperElement) {
            var $mount = findBadgeMountTarget(matchedPreview, matchedPreview.wrapperElement);
            $mount[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            $mount.addClass('rb-collab-locate-pulse');
            setTimeout(function () {
                $mount.removeClass('rb-collab-locate-pulse');
            }, 1800);

            setTimeout(function () {
                openCommentPopoverForPreview(matchedPreview);
            }, 220);
        }
    }

    function renderDrawerContent(instanceState) {
        if (!instanceState || !instanceState.$stageWrapper) {
            return;
        }

        var $drawer = instanceState.$stageWrapper.find('.rb-collab-drawer');
        if (!$drawer.length) {
            return;
        }

        var currentFilter = instanceState.drawerFilter || 'all',
            threads = Array.isArray(instanceState.threads) ? instanceState.threads : [],
            myUsername = normalizeType(runtimeConfig.currentUser && runtimeConfig.currentUser.username);

        var filteredThreads = threads.filter(function (thread) {
            if (currentFilter === 'open') {
                return thread.status !== 'resolved';
            }
            if (currentFilter === 'resolved') {
                return thread.status === 'resolved';
            }
            if (currentFilter === 'page') {
                return thread.target_type === 'page' || thread.target_id === 'page';
            }
            if (currentFilter === 'rows') {
                return thread.target_type !== 'page' && thread.target_id !== 'page';
            }
            if (currentFilter === 'mentions') {
                var allMentions = Array.isArray(thread.mentions) ? thread.mentions.map(normalizeType) : [];
                (thread.replies || []).forEach(function (r) {
                    if (Array.isArray(r.mentions)) {
                        allMentions = allMentions.concat(r.mentions.map(normalizeType));
                    }
                });
                return myUsername && allMentions.indexOf(myUsername) !== -1;
            }
            return true;
        });

        var html = '<div class="rb-collab-drawer-header">' +
            '<div class="rb-collab-drawer-title">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;">' + renderSolcartMarkSvg(18) + ' ' + escapeHtml($t('StageCraft Activity')) + '</span>' +
            '<span class="rb-collab-drawer-subtitle">' + escapeHtml(instanceState.instanceKey) + '</span>' +
            '</div>' +
            '<div class="rb-collab-drawer-header-actions">' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-drawer-refresh" title="' + escapeHtml($t('Refresh')) + '">&#8635;</button>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-drawer-close" title="' + escapeHtml($t('Close')) + '">&times;</button>' +
            '</div>' +
            '</div>';

        var filters = [
            { key: 'all', label: $t('All') },
            { key: 'open', label: $t('Open') },
            { key: 'page', label: $t('Page') },
            { key: 'rows', label: $t('Rows & Blocks') },
            { key: 'mentions', label: '@' + $t('Mentions') },
            { key: 'resolved', label: $t('Resolved') }
        ];

        html += '<div class="rb-collab-filter-bar">';
        filters.forEach(function (f) {
            html += '<button type="button" class="rb-collab-filter-chip' +
                (currentFilter === f.key ? ' is-active' : '') +
                '" data-filter="' + escapeHtml(f.key) + '">' + escapeHtml(f.label) + '</button>';
        });
        html += '</div>';

        html += '<div class="rb-collab-drawer-body">';
        if (!filteredThreads.length) {
            html += '<div class="rb-collab-empty-state">' +
                '<div class="rb-collab-empty-icon">&#128172;</div>' +
                '<div>' + escapeHtml($t('No comment threads match this filter.')) + '</div>' +
                '<div class="rb-collab-empty-hint">' +
                escapeHtml($t('Click any Row badge or use "Page Comments" in the toolbar to start collaborating.')) +
                '</div>' +
                '</div>';
        } else {
            filteredThreads.forEach(function (thread) {
                var isResolved = thread.status === 'resolved',
                    replyCount = Array.isArray(thread.replies) ? thread.replies.length : 0,
                    badgeLabel = thread.target_label || (thread.target_type === 'page' ? $t('Page') : thread.target_type);

                html += '<div class="rb-collab-drawer-card' + (isResolved ? ' is-resolved' : '') + '" ' +
                    'data-comment-id="' + escapeHtml(thread.comment_id) + '">' +
                    '<div class="rb-collab-drawer-card-top">' +
                    '<span class="rb-collab-target-chip">' + escapeHtml(badgeLabel) + '</span>' +
                    '<span class="rb-collab-status-badge ' + (isResolved ? 'is-resolved' : 'is-open') + '">' +
                    escapeHtml(isResolved ? $t('Resolved') : $t('Open')) +
                    '</span>' +
                    '</div>' +
                    '<div class="rb-collab-drawer-card-author">' +
                    '<strong>' + escapeHtml(thread.author_name) + '</strong> ' +
                    '<span class="rb-collab-muted">@' + escapeHtml(thread.author_username) + ' &bull; ' +
                    escapeHtml(formatTimestamp(thread.created_at)) + '</span>' +
                    '</div>' +
                    '<div class="rb-collab-drawer-card-text">' + formatCommentBodyHtml(thread.comment_text) + '</div>' +
                    '<div class="rb-collab-drawer-card-footer">' +
                    '<span>' + escapeHtml($t('%1 repl(ies)').replace('%1', replyCount)) + '</span>' +
                    '<button type="button" class="rb-collab-link-btn rb-collab-drawer-jump" ' +
                    'data-comment-id="' + escapeHtml(thread.comment_id) + '">' +
                    escapeHtml(thread.target_type === 'page' ? $t('Open Page Thread') : $t('Jump to Element')) + ' &rarr;' +
                    '</button>' +
                    '</div>' +
                    '</div>';
            });
        }
        html += '</div>';

        $drawer.html(html);

        $drawer.find('.rb-collab-drawer-close').on('click', function () {
            $drawer.removeClass('is-open');
        });

        $drawer.find('.rb-collab-drawer-refresh').on('click', function () {
            loadInstanceComments(instanceState.stageId);
        });

        $drawer.find('.rb-collab-filter-chip').on('click', function () {
            instanceState.drawerFilter = $(this).attr('data-filter') || 'all';
            renderDrawerContent(instanceState);
        });

        $drawer.find('.rb-collab-drawer-jump, .rb-collab-drawer-card').on('click', function (event) {
            event.stopPropagation();
            var commentId = parseInt($(this).closest('[data-comment-id]').attr('data-comment-id'), 10),
                thread = _.find(threads, function (t) {
                    return parseInt(t.comment_id, 10) === commentId;
                });

            if (thread) {
                locateAndOpenTargetFromThread(instanceState.stageId, thread);
            }
        });
    }

    function closePopover() {
        $('.rb-collab-popover').remove();
        $('.rb-collab-target-active').removeClass('rb-collab-target-active');
        activePopoverState = null;
    }

    function positionPopover($popover, $anchor, $container) {
        if (!$anchor || !$anchor.length) {
            $popover.css({ top: 100, left: 100 });
            return;
        }

        var isInsideFullScreen = $container && $container.hasClass('stage-full-screen');
        if (isInsideFullScreen) {
            var containerOffset = $container.offset() || { top: 0, left: 0 },
                anchorOffset = $anchor.offset() || { top: 80, left: 80 },
                relTop = Math.max(56, anchorOffset.top - containerOffset.top + 8),
                relLeft = Math.min(
                    Math.max(16, anchorOffset.left - containerOffset.left + $anchor.outerWidth() - 420),
                    Math.max(16, $container.outerWidth() - 440)
                );

            $popover.css({
                position: 'fixed',
                top: Math.min(relTop, window.innerHeight - 480),
                left: relLeft
            });
            return;
        }

        var offset = $anchor.offset() || { top: 140, left: 140 },
            popoverWidth = 410,
            leftPos = offset.left + $anchor.outerWidth() - popoverWidth;

        if (leftPos < 20) {
            leftPos = Math.max(20, offset.left + 12);
        }
        if (leftPos + popoverWidth > $(window).width() - 20) {
            leftPos = $(window).width() - popoverWidth - 20;
        }

        $popover.css({
            position: 'absolute',
            top: Math.max(60, offset.top + 28),
            left: leftPos
        });
    }

    function attachMentionAutocomplete($textarea, $dropdown) {
        $textarea.on('input keyup', function () {
            var val = $textarea.val() || '',
                cursorPos = $textarea[0].selectionStart || val.length,
                beforeCursor = val.substring(0, cursorPos),
                match = beforeCursor.match(/@([a-zA-Z0-9._-]*)$/);

            if (!match || !mentionableUsers.length) {
                $dropdown.hide().empty();
                return;
            }

            var query = normalizeType(match[1]),
                matches = mentionableUsers.filter(function (u) {
                    return !query ||
                        normalizeType(u.username).indexOf(query) !== -1 ||
                        normalizeType(u.name).indexOf(query) !== -1;
                }).slice(0, 6);

            if (!matches.length) {
                $dropdown.hide().empty();
                return;
            }

            var listHtml = '';
            matches.forEach(function (user) {
                listHtml += '<div class="rb-collab-mention-item" data-username="' + escapeHtml(user.username) + '">' +
                    '<span class="rb-collab-avatar-sm">' + escapeHtml(getAuthorInitials(user.name)) + '</span>' +
                    '<span class="rb-collab-mention-name">' + escapeHtml(user.name) + '</span>' +
                    '<span class="rb-collab-mention-handle">@' + escapeHtml(user.username) + '</span>' +
                    '</div>';
            });

            $dropdown.html(listHtml).show();

            $dropdown.find('.rb-collab-mention-item').on('mousedown', function (event) {
                event.preventDefault();
                var chosen = $(this).attr('data-username'),
                    replaced = beforeCursor.replace(/@([a-zA-Z0-9._-]*)$/, '@' + chosen + ' '),
                    afterCursor = val.substring(cursorPos);

                $textarea.val(replaced + afterCursor).trigger('focus');
                $dropdown.hide().empty();
            });
        });

        $textarea.on('blur', function () {
            setTimeout(function () {
                $dropdown.hide();
            }, 180);
        });
    }

    function renderPopoverContent() {
        if (!activePopoverState) {
            return;
        }

        var stageId = activePopoverState.stageId,
            instanceState = instancesByStageId[stageId],
            targetInfo = activePopoverState.targetInfo,
            preview = activePopoverState.preview,
            $popover = activePopoverState.$popover,
            statusFilter = activePopoverState.statusFilter || 'all';

        if (!instanceState || !$popover || !$popover.length) {
            return;
        }

        var allTargetThreads = getThreadsForTarget(instanceState, targetInfo),
            summary = summarizeTargetThreads(allTargetThreads),
            visibleThreads = allTargetThreads.filter(function (thread) {
                if (statusFilter === 'open') {
                    return thread.status !== 'resolved';
                }
                if (statusFilter === 'resolved') {
                    return thread.status === 'resolved';
                }
                return true;
            }),
            aiAvailable = isAiEnabledForPreview(preview);

        var html = '<div class="rb-collab-popover-header">' +
            '<div class="rb-collab-popover-title-wrap">' +
            '<span class="rb-collab-target-pill">' + escapeHtml(targetInfo.targetType.toUpperCase()) + '</span>' +
            '<strong class="rb-collab-popover-title">' + escapeHtml(targetInfo.targetLabel) + '</strong>' +
            '</div>' +
            '<div class="rb-collab-popover-header-right">' +
            (aiAvailable
                ? '<button type="button" class="rb-collab-action-btn rb-collab-popover-ai-btn" title="' +
                  escapeHtml($t('Open Solcart AI Assistant')) + '">&#10022; ' + escapeHtml($t('AI Assistant')) + '</button>'
                : '') +
            '<span class="rb-collab-summary-pill">' +
            escapeHtml($t('%1 open').replace('%1', summary.open)) +
            '</span>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-popover-close" title="' + escapeHtml($t('Close')) + '">&times;</button>' +
            '</div>' +
            '</div>';

        html += '<div class="rb-collab-popover-tabs">' +
            '<button type="button" class="rb-collab-tab-btn' + (statusFilter === 'all' ? ' is-active' : '') + '" data-tab="all">' +
            escapeHtml($t('All (%1)').replace('%1', summary.total)) + '</button>' +
            '<button type="button" class="rb-collab-tab-btn' + (statusFilter === 'open' ? ' is-active' : '') + '" data-tab="open">' +
            escapeHtml($t('Open (%1)').replace('%1', summary.open)) + '</button>' +
            '<button type="button" class="rb-collab-tab-btn' + (statusFilter === 'resolved' ? ' is-active' : '') + '" data-tab="resolved">' +
            escapeHtml($t('Resolved (%1)').replace('%1', summary.resolved)) + '</button>' +
            '</div>';

        html += '<div class="rb-collab-thread-list">';
        if (!visibleThreads.length) {
            html += '<div class="rb-collab-thread-empty">' +
                escapeHtml($t('No comments yet for %1. Start a thread below.').replace('%1', targetInfo.targetLabel)) +
                '</div>';
        } else {
            visibleThreads.forEach(function (thread) {
                var isResolved = thread.status === 'resolved',
                    replies = Array.isArray(thread.replies) ? thread.replies : [];

                html += '<div class="rb-collab-thread-card' + (isResolved ? ' is-resolved' : '') + '" ' +
                    'data-comment-id="' + escapeHtml(thread.comment_id) + '">' +
                    '<div class="rb-collab-comment-head">' +
                    '<span class="rb-collab-avatar">' + escapeHtml(getAuthorInitials(thread.author_name)) + '</span>' +
                    '<div class="rb-collab-author-meta">' +
                    '<div class="rb-collab-author-line">' +
                    '<strong>' + escapeHtml(thread.author_name) + '</strong> ' +
                    '<span class="rb-collab-username">@' + escapeHtml(thread.author_username) + '</span>' +
                    '</div>' +
                    '<div class="rb-collab-timestamp">' + escapeHtml(formatTimestamp(thread.created_at)) + '</div>' +
                    '</div>' +
                    '<div class="rb-collab-thread-actions">';

                if (runtimeConfig.permissions.resolve) {
                    html += '<button type="button" class="rb-collab-action-btn rb-collab-toggle-status" ' +
                        'data-comment-id="' + escapeHtml(thread.comment_id) + '" ' +
                        'data-next-status="' + (isResolved ? 'open' : 'resolved') + '" ' +
                        'title="' + escapeHtml(isResolved ? $t('Reopen Thread') : $t('Resolve Thread')) + '">' +
                        (isResolved ? '&#8634; ' + escapeHtml($t('Reopen')) : '&#10003; ' + escapeHtml($t('Resolve'))) +
                        '</button>';
                }

                if (runtimeConfig.permissions.delete) {
                    html += '<button type="button" class="rb-collab-action-btn rb-collab-delete-btn" ' +
                        'data-comment-id="' + escapeHtml(thread.comment_id) + '" ' +
                        'title="' + escapeHtml($t('Delete Thread')) + '">&times;</button>';
                }

                html += '</div></div>';

                html += '<div class="rb-collab-comment-body">' + formatCommentBodyHtml(thread.comment_text) + '</div>';

                if (isResolved && thread.resolved_by_name) {
                    html += '<div class="rb-collab-resolved-banner">' +
                        '&#10003; ' + escapeHtml($t('Resolved by %1').replace('%1', thread.resolved_by_name)) +
                        '</div>';
                }

                if (replies.length) {
                    html += '<div class="rb-collab-replies">';
                    replies.forEach(function (reply) {
                        html += '<div class="rb-collab-reply-item" data-comment-id="' + escapeHtml(reply.comment_id) + '">' +
                            '<div class="rb-collab-reply-head">' +
                            '<span class="rb-collab-avatar-sm">' + escapeHtml(getAuthorInitials(reply.author_name)) + '</span>' +
                            '<strong>' + escapeHtml(reply.author_name) + '</strong> ' +
                            '<span class="rb-collab-username">@' + escapeHtml(reply.author_username) + '</span>' +
                            '<span class="rb-collab-timestamp">' + escapeHtml(formatTimestamp(reply.created_at)) + '</span>';

                        if (runtimeConfig.permissions.delete) {
                            html += '<button type="button" class="rb-collab-delete-reply rb-collab-delete-btn" ' +
                                'data-comment-id="' + escapeHtml(reply.comment_id) + '" title="' + escapeHtml($t('Delete Reply')) + '">&times;</button>';
                        }

                        html += '</div>' +
                            '<div class="rb-collab-reply-body">' + formatCommentBodyHtml(reply.comment_text) + '</div>' +
                            '</div>';
                    });
                    html += '</div>';
                }

                html += '<div class="rb-collab-thread-footer">';
                if (runtimeConfig.permissions.comment) {
                    html += '<button type="button" class="rb-collab-link-btn rb-collab-reply-trigger" ' +
                        'data-comment-id="' + escapeHtml(thread.comment_id) + '">' +
                        escapeHtml($t('Reply')) + '</button>';
                }
                if (aiAvailable) {
                    html += '<button type="button" class="rb-collab-link-btn rb-collab-ai-apply-btn" ' +
                        'data-comment-id="' + escapeHtml(thread.comment_id) + '" ' +
                        'data-comment-text="' + escapeHtml(thread.comment_text) + '">' +
                        '&#10022; ' + escapeHtml($t('Apply & Resolve Thread')) + '</button>';
                }
                html += '</div>';

                if (runtimeConfig.permissions.comment) {
                    html += '<div class="rb-collab-reply-box" data-parent-id="' + escapeHtml(thread.comment_id) + '" style="display:none;">' +
                        '<div class="rb-collab-composer-input-wrap">' +
                        '<textarea class="rb-collab-reply-input" rows="2" placeholder="' +
                        escapeHtml($t('Write a reply... Use @ to mention a teammate')) + '"></textarea>' +
                        '<div class="rb-collab-mention-dropdown" style="display:none;"></div>' +
                        '</div>' +
                        '<div class="rb-collab-reply-actions">' +
                        '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-reply-cancel">' + escapeHtml($t('Cancel')) + '</button>' +
                        '<button type="button" class="rb-collab-btn rb-collab-btn-primary rb-collab-reply-submit" data-parent-id="' +
                        escapeHtml(thread.comment_id) + '">' + escapeHtml($t('Reply')) + '</button>' +
                        '</div>' +
                        '</div>';
                }

                html += '</div>';
            });
        }
        html += '</div>';

        if (runtimeConfig.permissions.comment) {
            html += '<div class="rb-collab-composer">' +
                '<div class="rb-collab-composer-error" style="display:none;"></div>' +
                '<div class="rb-collab-composer-input-wrap">' +
                '<textarea class="rb-collab-new-comment-input" rows="3" placeholder="' +
                escapeHtml($t('Add a comment on %1... (Tip: type @ to mention an admin user)').replace('%1', targetInfo.targetLabel)) +
                '"></textarea>' +
                '<div class="rb-collab-mention-dropdown" style="display:none;"></div>' +
                '</div>' +
                '<div class="rb-collab-composer-footer">' +
                '<span class="rb-collab-composer-hint">' +
                escapeHtml($t('Commenting as @%1').replace('%1', runtimeConfig.currentUser.username || 'admin')) +
                '</span>' +
                '<button type="button" class="rb-collab-btn rb-collab-btn-primary rb-collab-submit-comment">' +
                escapeHtml($t('Post Comment')) +
                '</button>' +
                '</div>' +
                '</div>';
        }

        $popover.html(html);

        $popover.find('.rb-collab-popover-close').on('click', function () {
            closePopover();
        });

        $popover.find('.rb-collab-popover-ai-btn').on('click', function () {
            openAiModalForPreview(preview);
        });

        $popover.find('.rb-collab-tab-btn').on('click', function () {
            activePopoverState.statusFilter = $(this).attr('data-tab') || 'all';
            renderPopoverContent();
        });

        $popover.find('.rb-collab-reply-trigger').on('click', function () {
            var commentId = $(this).attr('data-comment-id'),
                $box = $popover.find('.rb-collab-reply-box[data-parent-id="' + commentId + '"]');

            $box.slideToggle(120, function () {
                if ($box.is(':visible')) {
                    $box.find('.rb-collab-reply-input').trigger('focus');
                }
            });
        });

        $popover.find('.rb-collab-reply-cancel').on('click', function () {
            $(this).closest('.rb-collab-reply-box').slideUp(120);
        });

        $popover.find('.rb-collab-ai-apply-btn').on('click', function () {
            var commentId = parseInt($(this).attr('data-comment-id'), 10),
                commentText = $(this).attr('data-comment-text') || '',
                matchedThread = _.find(allTargetThreads, function (t) {
                    return parseInt(t.comment_id, 10) === commentId;
                });

            var promptLines = ['Apply this collaborative review thread to update the block content:'];
            if (matchedThread) {
                promptLines.push('- @' + (matchedThread.author_username || 'admin') + ': ' + matchedThread.comment_text);
                (matchedThread.replies || []).forEach(function (r) {
                    promptLines.push('  - @' + (r.author_username || 'teammate') + ': ' + r.comment_text);
                });
            } else {
                promptLines.push(commentText);
            }

            var applyMode = (targetInfo.targetType === 'row' || targetInfo.targetType === 'column') ? 'layout' : 'build';

            openAiModalForPreview(
                preview,
                promptLines.join('\n'),
                applyMode,
                { thread: matchedThread || null }
            );
        });

        var $mainInput = $popover.find('.rb-collab-new-comment-input'),
            $mainDropdown = $mainInput.siblings('.rb-collab-mention-dropdown');

        attachMentionAutocomplete($mainInput, $mainDropdown);

        $popover.find('.rb-collab-reply-box').each(function () {
            var $replyInput = $(this).find('.rb-collab-reply-input'),
                $replyDropdown = $(this).find('.rb-collab-mention-dropdown');

            attachMentionAutocomplete($replyInput, $replyDropdown);
        });

        $popover.find('.rb-collab-submit-comment').on('click', function () {
            var commentText = ($mainInput.val() || '').trim();
            if (!commentText) {
                $popover.find('.rb-collab-composer-error').text($t('Please enter a comment.')).show();
                return;
            }
            submitComment(stageId, targetInfo, preview, commentText, null, $(this));
        });

        $popover.find('.rb-collab-reply-submit').on('click', function () {
            var parentId = parseInt($(this).attr('data-parent-id'), 10),
                $box = $(this).closest('.rb-collab-reply-box'),
                replyText = ($box.find('.rb-collab-reply-input').val() || '').trim();

            if (!replyText) {
                return;
            }
            submitComment(stageId, targetInfo, preview, replyText, parentId, $(this));
        });

        $popover.find('.rb-collab-toggle-status').on('click', function () {
            var commentId = parseInt($(this).attr('data-comment-id'), 10),
                nextStatus = $(this).attr('data-next-status') || 'resolved';

            updateCommentStatus(stageId, commentId, nextStatus, $(this));
        });

        $popover.find('.rb-collab-delete-btn').on('click', function () {
            var commentId = parseInt($(this).attr('data-comment-id'), 10);
            deleteCommentById(stageId, commentId, $(this));
        });
    }

    function openCommentPopoverForPreview(preview) {
        if (!preview || !preview.contentType) {
            return;
        }

        var stageId = preview.contentType.stageId,
            instanceState = instancesByStageId[stageId];

        if (!instanceState) {
            return;
        }

        closeAiModal();
        closePopover();

        var targetInfo = resolvePreviewIdentity(preview, false),
            $anchor = findBadgeMountTarget(preview, preview.wrapperElement),
            $container = instanceState.$stageWrapper && instanceState.$stageWrapper.hasClass('stage-full-screen')
                ? instanceState.$stageWrapper
                : $('body'),
            $popover = $('<div></div>', { class: 'rb-collab-popover' });

        $anchor.addClass('rb-collab-target-active');
        $container.append($popover);

        activePopoverState = {
            stageId: stageId,
            preview: preview,
            targetInfo: targetInfo,
            $anchor: $anchor,
            $container: $container,
            $popover: $popover,
            statusFilter: 'all'
        };

        renderPopoverContent();
        positionPopover($popover, $anchor, $container);
    }

    function openPageCommentPopover(stageId, $anchorBtn) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState) {
            return;
        }

        closeAiModal();
        closePopover();

        var targetInfo = {
                targetId: 'page',
                targetType: 'page',
                structuralPath: 'page',
                targetLabel: $t('Page-Level Comments')
            },
            $container = instanceState.$stageWrapper && instanceState.$stageWrapper.hasClass('stage-full-screen')
                ? instanceState.$stageWrapper
                : $('body'),
            $popover = $('<div></div>', { class: 'rb-collab-popover rb-collab-popover-page' });

        $container.append($popover);

        activePopoverState = {
            stageId: stageId,
            preview: null,
            targetInfo: targetInfo,
            $anchor: $anchorBtn,
            $container: $container,
            $popover: $popover,
            statusFilter: 'all'
        };

        renderPopoverContent();
        positionPopover($popover, $anchorBtn, $container);
    }

    function applyUpdatedPayload(stageId, payload, users) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState || !payload) {
            return;
        }

        instanceState.threads = Array.isArray(payload.threads) ? payload.threads : [];
        instanceState.counts = payload.counts || {};

        if (Array.isArray(users)) {
            mentionableUsers = users;
            usersLoaded = true;
        }

        renderStageHeaderToolbar(instanceState);
        refreshAllBadgesForStage(stageId);

        if (activePopoverState && activePopoverState.stageId === stageId) {
            renderPopoverContent();
        }
    }

    function loadInstanceComments(stageId) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState || !runtimeConfig.urls.list) {
            return;
        }

        $.ajax({
            url: runtimeConfig.urls.list,
            method: 'POST',
            dataType: 'json',
            data: {
                form_key: window.FORM_KEY || runtimeConfig.formKey,
                instance_key: instanceState.instanceKey,
                include_users: usersLoaded ? 0 : 1
            }
        }).done(function (response) {
            if (response && response.success && response.data) {
                applyUpdatedPayload(stageId, response.data, response.users);
            }
        });
    }

    function submitComment(stageId, targetInfo, preview, commentText, parentId, $btn) {
        var instanceState = instancesByStageId[stageId];
        if (!instanceState || !runtimeConfig.urls.save) {
            return;
        }

        if (preview && targetInfo.targetType !== 'page') {
            targetInfo = resolvePreviewIdentity(preview, true);
            if (activePopoverState) {
                activePopoverState.targetInfo = targetInfo;
            }
        }

        $btn.prop('disabled', true);

        $.ajax({
            url: runtimeConfig.urls.save,
            method: 'POST',
            dataType: 'json',
            data: {
                form_key: window.FORM_KEY || runtimeConfig.formKey,
                instance_key: instanceState.instanceKey,
                entity_type: runtimeConfig.entityType,
                entity_id: runtimeConfig.entityId,
                field_name: instanceState.fieldName,
                target_type: targetInfo.targetType,
                target_id: targetInfo.targetId,
                structural_path: targetInfo.structuralPath,
                target_label: targetInfo.targetLabel,
                parent_id: parentId || '',
                comment_text: commentText
            }
        }).done(function (response) {
            if (response && response.success && response.data) {
                applyUpdatedPayload(stageId, response.data);
                return;
            }
            var msg = (response && response.message) ? response.message : $t('Failed to save comment.');
            if (activePopoverState && activePopoverState.$popover) {
                activePopoverState.$popover.find('.rb-collab-composer-error').text(msg).show();
            }
        }).fail(function (xhr) {
            var msg = (xhr && xhr.responseJSON && xhr.responseJSON.message)
                ? xhr.responseJSON.message
                : $t('Request failed while saving comment.');
            if (activePopoverState && activePopoverState.$popover) {
                activePopoverState.$popover.find('.rb-collab-composer-error').text(msg).show();
            }
        }).always(function () {
            $btn.prop('disabled', false);
        });
    }

    function updateCommentStatus(stageId, commentId, status, $btn) {
        if (!runtimeConfig.urls.status) {
            return;
        }

        $btn.prop('disabled', true);

        $.ajax({
            url: runtimeConfig.urls.status,
            method: 'POST',
            dataType: 'json',
            data: {
                form_key: window.FORM_KEY || runtimeConfig.formKey,
                comment_id: commentId,
                status: status
            }
        }).done(function (response) {
            if (response && response.success && response.data) {
                applyUpdatedPayload(stageId, response.data);
            }
        }).always(function () {
            $btn.prop('disabled', false);
        });
    }

    function deleteCommentById(stageId, commentId, $btn) {
        if (!runtimeConfig.urls.delete) {
            return;
        }

        $btn.prop('disabled', true);

        $.ajax({
            url: runtimeConfig.urls.delete,
            method: 'POST',
            dataType: 'json',
            data: {
                form_key: window.FORM_KEY || runtimeConfig.formKey,
                comment_id: commentId
            }
        }).done(function (response) {
            if (response && response.success && response.data) {
                applyUpdatedPayload(stageId, response.data);
            }
        }).always(function () {
            $btn.prop('disabled', false);
        });
    }

    function walkAndAttachStageTree(contentType) {
        if (!contentType) {
            return;
        }

        if (contentType.preview) {
            var p = contentType.preview,
                el = p.wrapperElement ||
                    (p.element && p.element[0]) ||
                    p.element ||
                    (p.groupElement && p.groupElement[0] && $(p.groupElement[0]).closest('.pagebuilder-column-group')[0]);
            if (el) {
                p.wrapperElement = el;
                attachPreviewElement(p, el);
            }
        }

        if (typeof contentType.getChildren === 'function') {
            var children = contentType.getChildren()() || [];
            children.forEach(function (child) {
                walkAndAttachStageTree(child);
            });
        }
    }

    function registerPageBuilder(pageBuilder) {
        if ((!runtimeConfig.enabled && !(runtimeConfig.ai && runtimeConfig.ai.enabled)) || !pageBuilder || !pageBuilder.id) {
            return;
        }

        var stageId = pageBuilder.id,
            fieldName = detectFieldNameForStage(pageBuilder),
            instanceKey = buildInstanceKey(fieldName);

        instancesByStageId[stageId] = {
            stageId: stageId,
            pageBuilder: pageBuilder,
            fieldName: fieldName,
            instanceKey: instanceKey,
            threads: [],
            counts: {},
            drawerFilter: 'all',
            $stageWrapper: null
        };

        if (runtimeConfig.enabled || (runtimeConfig.ai && runtimeConfig.ai.enabled)) {
            renderStageHeaderToolbar(instancesByStageId[stageId]);
            if (pageBuilder.stage && pageBuilder.stage.rootContainer) {
                walkAndAttachStageTree(pageBuilder.stage.rootContainer);
            }
            refreshAllBadgesForStage(stageId);

            if (runtimeConfig.enabled) {
                loadInstanceComments(stageId);
            }

            events.on('stage:updateAfter', function (args) {
                if (args && args.stageId === stageId) {
                    _.defer(function () {
                        if (pageBuilder.stage && pageBuilder.stage.rootContainer) {
                            walkAndAttachStageTree(pageBuilder.stage.rootContainer);
                        }
                        refreshAllBadgesForStage(stageId);
                    });
                }
            });
        }
    }

    function unregisterPageBuilder(pageBuilder) {
        if (!pageBuilder || !pageBuilder.id) {
            return;
        }

        delete instancesByStageId[pageBuilder.id];
        delete previewsByStageId[pageBuilder.id];
    }

    function onFullScreenChange(pageBuilder) {
        if (!pageBuilder || !pageBuilder.id || !instancesByStageId[pageBuilder.id]) {
            return;
        }

        closePopover();
        closeAiModal();
        renderStageHeaderToolbar(instancesByStageId[pageBuilder.id]);
        refreshAllBadgesForStage(pageBuilder.id);
    }

    function attachPreviewElement(preview, wrapperElement) {
        if (!runtimeConfig.enabled || !preview || !preview.contentType || !wrapperElement) {
            return;
        }

        var stageId = preview.contentType.stageId;
        if (!previewsByStageId[stageId]) {
            previewsByStageId[stageId] = [];
        }

        if (previewsByStageId[stageId].indexOf(preview) === -1) {
            previewsByStageId[stageId].push(preview);
        }

        _.defer(function () {
            renderPreviewFloatingBadge(preview);
        });
    }

    function handleContentTypeDuplicated(originalContentType, duplicateContentType) {
        if (!duplicateContentType) {
            return;
        }

        stripCollabIdFromClone(duplicateContentType);
    }

    function bindGlobalListeners() {
        if (globalListenersBound) {
            return;
        }
        globalListenersBound = true;

        $(document).on('mousedown.rbCollab', function (event) {
            if (!$(event.target).closest(
                '.rb-collab-popover, .rb-collab-floating-pill, .rb-collab-option, .rb-collab-page-comments-btn, .rb-collab-drawer'
            ).length) {
                closePopover();
            }

            if (!$(event.target).closest(
                '.rb-collab-ai-modal, .rb-collab-ai-option, .rb-collab-ai-apply-btn, .rb-collab-pill-ai, .rb-collab-popover-ai-btn'
            ).length) {
                closeAiModal();
            }
            if (!$(event.target).closest('.rb-collab-header-dropdown-wrap').length) {
                $('.rb-collab-header-dropdown-wrap.is-open').removeClass('is-open');
            }
        });

        $(document).on('keydown.rbCollab', function (event) {
            if (event.key === 'Escape') {
                closePopover();
                closeAiModal();
                $('.rb-collab-header-dropdown-wrap.is-open').removeClass('is-open');
            }
        });

        events.on('column:initializeAfter', function (args) {
            if (args && args.column && args.column.preview && args.element) {
                var colEl = args.element[0] || args.element;
                args.column.preview.wrapperElement = colEl;
                attachPreviewElement(args.column.preview, colEl);
            }
        });

        events.on('contentType:mountAfter', function (args) {
            if (args && args.contentType && args.contentType.preview) {
                _.delay(function () {
                    var p = args.contentType.preview,
                        el = p.wrapperElement || (p.element && p.element[0]) || p.element;
                    if (el) {
                        p.wrapperElement = el;
                        attachPreviewElement(p, el);
                    }
                }, 80);
            }
        });

        events.on('pagebuilder:register', function (data) {
            if (data && data.instance) {
                _.delay(function () {
                    if (!instancesByStageId[data.instance.id]) {
                        registerPageBuilder(data.instance);
                    }
                }, 250);
            }
        });
    }

    function startPollingIfConfigured() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }

        var intervalSec = parseInt(runtimeConfig.pollingInterval, 10) || 0;
        if (intervalSec >= 10) {
            pollingTimer = setInterval(function () {
                Object.keys(instancesByStageId).forEach(function (stageId) {
                    loadInstanceComments(stageId);
                });
            }, intervalSec * 1000);
        }
    }

    function fetchInitialAiLicenseStatus() {
        if (!runtimeConfig.ai || !runtimeConfig.ai.enabled || !runtimeConfig.urls.aiStatus) {
            return;
        }

        $.ajax({
            url: runtimeConfig.urls.aiStatus,
            method: 'GET',
            dataType: 'json'
        }).done(function (res) {
            if (res && res.status) {
                aiUsageState = $.extend({}, aiUsageState, res.status);
                Object.keys(instancesByStageId).forEach(function (stageId) {
                    renderStageHeaderToolbar(instancesByStageId[stageId]);
                });
                $('.rb-collab-scaffolder-plan-slot').html(formatAiPlanBadgeHtml());
            }
        });
    }

    function findPageScaffolderAnchor() {
        var $contentFieldset = $('.fieldset-wrapper[data-index="content"]').first();
        if ($contentFieldset.length) {
            return $contentFieldset;
        }

        var $byTitle = $('.fieldset-wrapper').filter(function () {
            var titleText = ($(this).children('.fieldset-wrapper-title').text() || '').trim().toLowerCase();
            return titleText === 'content';
        }).first();
        if ($byTitle.length) {
            return $byTitle;
        }

        var $contentField = $('.admin__field[data-index="content"]').first();
        if ($contentField.length) {
            return $contentField;
        }

        return $();
    }

    function mountInlinePageScaffolder() {
        if (!runtimeConfig.ai || !runtimeConfig.ai.enabled || !runtimeConfig.permissions.ai) {
            return false;
        }

        if ($('.rb-collab-page-scaffolder-wrap').length) {
            return true;
        }

        var $anchor = findPageScaffolderAnchor();
        if (!$anchor.length) {
            return false;
        }

        var sessionKey = 'page_scaffold:' + (runtimeConfig.entityType || 'cms_page') + ':' + (runtimeConfig.entityId || 'new'),
            savedSession = aiSessionsByTargetKey[sessionKey] || {
                turns: [],
                draftPrompt: '',
                lastResponseText: '',
                lastBlueprint: null,
                lastResolvedMode: 'auto',
                isOpen: false
            };

        aiSessionsByTargetKey[sessionKey] = savedSession;

        var $wrap = $('<div></div>', {
            class: 'rb-collab-page-scaffolder-wrap' + (savedSession.isOpen ? ' is-open' : '')
        });

        var html = '<div class="rb-collab-page-scaffolder-bar">' +
            '<div class="rb-collab-page-scaffolder-bar-left">' +
            renderSolcartMarkSvg(20) +
            '<span class="rb-collab-target-pill">' + escapeHtml($t('PAGE SCAFFOLDER')) + '</span>' +
            '<strong>' + escapeHtml($t('Solcart AI Page Scaffolder')) + '</strong>' +
            '<span class="rb-collab-page-scaffolder-subtitle">' +
            escapeHtml($t('Scaffold a multi-row Page Builder draft or iteratively refine your page structure')) +
            '</span>' +
            '</div>' +
            '<div class="rb-collab-page-scaffolder-bar-right">' +
            '<span class="rb-collab-scaffolder-plan-slot">' + formatAiPlanBadgeHtml() + '</span>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-primary rb-collab-scaffolder-toggle-btn">' +
            '&#10022; <span class="rb-collab-scaffolder-toggle-label">' +
            escapeHtml(savedSession.isOpen ? $t('Hide AI Page Scaffolder') : $t('Scaffold Page with AI')) +
            '</span>' +
            '</button>' +
            '</div>' +
            '</div>';

        html += '<div class="rb-collab-page-scaffolder-panel"' + (savedSession.isOpen ? '' : ' style="display:none;"') + '>' +
            '<div class="rb-collab-page-scaffolder-top-row">' +
            '<div class="rb-collab-ai-quick-chips">' +
            '<button type="button" class="rb-collab-ai-chip" data-prompt="Build a 3-row landing page: Row 1 is a 100% Hero banner with a headline, subtitle, and Shop Now button; Row 2 has 3 equal columns (33.33% each) highlighting key features with headings, descriptions, and CTA buttons; Row 3 is a 2-column (50/50) FAQ and Contact CTA section.">' +
            '&#9889; ' + escapeHtml($t('Landing Page (Hero + 3 Features + CTA)')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-prompt="Build a 4-row product launch page: Row 1 is a 100% Hero intro with primary CTA; Row 2 is a 2-column (50/50) product story and specifications; Row 3 has 3 equal columns (33.33% each) of customer benefits with buttons; Row 4 has 3 Tabs (Overview, Specifications, Shipping & Returns).">' +
            '&#9889; ' + escapeHtml($t('Product Launch (4 Rows + Tabs)')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-prompt="Build a 3-row About Us page: Row 1 is a 100% Brand Story section; Row 2 has 3 equal columns (33.33% each) for our Core Values (Craftsmanship, Sustainability, Community); Row 3 is a 2-column (50/50) Careers & Contact Us section with buttons.">' +
            '&#9889; ' + escapeHtml($t('About Us (Story + 3 Values + Contact)')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-prompt="Build a 3-row showcase page: Row 1 is a 3-slide Promotional Slider; Row 2 has 4 equal columns (25% each) featuring top store categories with Shop buttons; Row 3 has 3 FAQ Tabs.">' +
            '&#9889; ' + escapeHtml($t('Store Showcase (Slider + 4-Col Grid + Tabs)')) + '</button>' +
            '</div>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-scaffolder-reset"' +
            (savedSession.turns.length ? '' : ' style="display:none;"') + ' title="' +
            escapeHtml($t('Clear page scaffolding conversation')) + '">&#8634; ' + escapeHtml($t('Reset Draft')) + '</button>' +
            '</div>' +
            '<textarea class="rb-collab-ai-input rb-collab-scaffolder-input" rows="3" placeholder="' +
            escapeHtml($t('Describe the multi-row page you want to scaffold (e.g., "Row 1: Hero banner, Row 2: 3 feature columns with heading and text, Row 3: 2-column CTA"), or enter a follow-up prompt to refine specific rows...')) +
            '"></textarea>' +
            '<div class="rb-collab-ai-response-wrap rb-collab-scaffolder-response-wrap">' +
            '<div class="rb-collab-ai-loading-facade"><div class="rb-collab-ai-pulse"></div>' +
            '<span>' + escapeHtml($t('Solcart AI is designing your multi-row page blueprint...')) + '</span></div>' +
            '<div class="rb-collab-ai-response rb-collab-scaffolder-response" aria-live="polite"></div>' +
            '</div>' +
            '<div class="rb-collab-ai-actions rb-collab-scaffolder-actions">' +
            '<span class="rb-collab-scaffolder-hint">' +
            escapeHtml($t('Tip: You can iteratively refine rows here, then build onto the stage and use per-element ✦ AI buttons for granular edits.')) +
            '</span>' +
            '<div class="rb-collab-scaffolder-action-btns">' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-scaffolder-append" disabled>' +
            '+ ' + escapeHtml($t('Append Rows to Stage')) + '</button>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-scaffolder-build" disabled>' +
            '&#9889; ' + escapeHtml($t('Build Page on Stage')) + '</button>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-primary rb-collab-scaffolder-submit">' +
            '&#10022; ' + escapeHtml($t('Generate Page Draft')) + '</button>' +
            '</div>' +
            '</div>' +
            '</div>';

        $wrap.html(html);
        $wrap.insertBefore($anchor);

        var $panel = $wrap.find('.rb-collab-page-scaffolder-panel'),
            $input = $wrap.find('.rb-collab-scaffolder-input'),
            $response = $wrap.find('.rb-collab-scaffolder-response'),
            $buildBtn = $wrap.find('.rb-collab-scaffolder-build'),
            $appendBtn = $wrap.find('.rb-collab-scaffolder-append'),
            $submitBtn = $wrap.find('.rb-collab-scaffolder-submit'),
            $resetBtn = $wrap.find('.rb-collab-scaffolder-reset');

        if (savedSession.draftPrompt) {
            $input.val(savedSession.draftPrompt);
        }

        function renderScaffolderHistory() {
            if (!savedSession.turns || !savedSession.turns.length) {
                $response.html(
                    '<div class="rb-collab-scaffolder-empty">' +
                    escapeHtml($t('Select a quick-start page template above or describe the rows and sections you want on this page.')) +
                    '</div>'
                );
                return;
            }

            var histHtml = '<div class="rb-collab-ai-history">';
            savedSession.turns.forEach(function (turn, idx) {
                var isLatest = idx === savedSession.turns.length - 1;
                histHtml += '<div class="rb-collab-ai-turn">' +
                    '<div class="rb-collab-ai-turn-user">' +
                    '<strong>' + escapeHtml($t('You')) + ':</strong> ' + escapeHtml(turn.prompt) +
                    '</div>';

                if (turn.mode === 'layout' && turn.blueprint) {
                    if (isLatest) {
                        histHtml += renderBlueprintPreviewHtml(turn.blueprint);
                    } else {
                        histHtml += '<div class="rb-collab-ai-turn-summary">&#9889; ' +
                            escapeHtml(turn.blueprint.summary || $t('Generated multi-row page blueprint')) +
                            '</div>';
                    }
                } else {
                    histHtml += '<div class="rb-collab-ai-result is-ask">' + escapeHtml(turn.response || '') + '</div>';
                }

                histHtml += '</div>';
            });
            histHtml += '</div>';
            $response.html(histHtml);
            $response.scrollTop($response[0].scrollHeight);
        }

        function renderScaffolderError(msg, paymentRequired, upgradeUrl) {
            var cta = '';
            if (paymentRequired && upgradeUrl) {
                cta = '<div style="margin-top:8px;"><a class="action-primary" href="' +
                    escapeHtml(upgradeUrl) + '" target="_blank" rel="noopener">' +
                    escapeHtml($t('Upgrade to Solcart AI Pro')) + '</a></div>';
            }
            $response.prepend(
                '<div class="message message-error"><div>' + escapeHtml(msg) + cta + '</div></div>'
            );
        }

        renderScaffolderHistory();
        if (savedSession.lastResolvedMode === 'layout' && savedSession.lastBlueprint) {
            $buildBtn.prop('disabled', false);
            $appendBtn.prop('disabled', false);
        }

        $wrap.on('click', '.rb-collab-scaffolder-toggle-btn', function () {
            savedSession.isOpen = !savedSession.isOpen;
            $wrap.toggleClass('is-open', savedSession.isOpen);
            $wrap.find('.rb-collab-scaffolder-toggle-label').text(
                savedSession.isOpen ? $t('Hide AI Page Scaffolder') : $t('Scaffold Page with AI')
            );
            if (savedSession.isOpen) {
                expandContentSectionIfCollapsed();
                $panel.slideDown(160, function () {
                    $input.trigger('focus');
                });
            } else {
                $panel.slideUp(160);
            }
        });

        $wrap.on('input', '.rb-collab-scaffolder-input', function () {
            savedSession.draftPrompt = $(this).val() || '';
        });

        $wrap.on('click', '.rb-collab-ai-chip', function () {
            var chipPrompt = $(this).attr('data-prompt') || '';
            savedSession.draftPrompt = chipPrompt;
            $input.val(chipPrompt).trigger('focus');
        });

        $wrap.on('click', '.rb-collab-scaffolder-reset', function () {
            savedSession.turns = [];
            savedSession.draftPrompt = '';
            savedSession.lastResponseText = '';
            savedSession.lastBlueprint = null;
            savedSession.lastResolvedMode = 'auto';
            $input.val('');
            $buildBtn.prop('disabled', true);
            $appendBtn.prop('disabled', true);
            $resetBtn.hide();
            renderScaffolderHistory();
        });

        $wrap.on('click', '.rb-collab-scaffolder-submit', function () {
            var prompt = ($input.val() || '').trim();
            if (!prompt) {
                renderScaffolderError($t('Please describe the page or rows you want to generate.'), false, '');
                return;
            }

            expandContentSectionIfCollapsed();
            $wrap.addClass('is-loading');
            $submitBtn.prop('disabled', true);
            $buildBtn.prop('disabled', true);
            $appendBtn.prop('disabled', true);

            $.ajax({
                url: runtimeConfig.urls.aiChat,
                method: 'POST',
                dataType: 'json',
                data: {
                    form_key: window.FORM_KEY || runtimeConfig.formKey,
                    prompt: prompt,
                    mode: 'auto',
                    context_type: 'page',
                    context_content: getWholeStageStructureSummary(),
                    comment_thread: '',
                    conversation_history: savedSession.turns.length ? JSON.stringify(savedSession.turns) : ''
                }
            }).done(function (response) {
                if (response && response.usage) {
                    aiUsageState = $.extend({}, aiUsageState, response.usage);
                    $('.rb-collab-scaffolder-plan-slot').html(formatAiPlanBadgeHtml());
                    Object.keys(instancesByStageId).forEach(function (sId) {
                        renderStageHeaderToolbar(instancesByStageId[sId]);
                    });
                }

                if (response && response.payment_required) {
                    renderScaffolderError(
                        response.error || $t('Your trial or credit limit has been reached.'),
                        true,
                        (response.usage && response.usage.upgrade_url) || ''
                    );
                    return;
                }

                if (response && response.success === true) {
                    var respText = (response.response || '').toString(),
                        blueprint = response.blueprint || null,
                        resolvedMode = response.mode || (blueprint ? 'layout' : 'ask');

                    savedSession.turns.push({
                        prompt: prompt,
                        mode: resolvedMode,
                        response: respText,
                        blueprint: blueprint
                    });
                    savedSession.lastResponseText = respText;
                    savedSession.lastBlueprint = blueprint;
                    savedSession.lastResolvedMode = resolvedMode;
                    savedSession.draftPrompt = '';
                    $input.val('');
                    $resetBtn.show();

                    renderScaffolderHistory();

                    var hasRows = resolvedMode === 'layout' && Boolean(blueprint);
                    $buildBtn.prop('disabled', !hasRows);
                    $appendBtn.prop('disabled', !hasRows);
                    return;
                }

                renderScaffolderError(
                    (response && (response.error || response.message)) || $t('Unable to complete AI page scaffolding request.'),
                    false,
                    ''
                );
            }).fail(function (xhr) {
                var msg = (xhr && xhr.responseJSON && (xhr.responseJSON.error || xhr.responseJSON.message))
                    ? (xhr.responseJSON.error || xhr.responseJSON.message)
                    : $t('Failed to communicate with the Solcart AI controller.');
                renderScaffolderError(msg, false, '');
            }).always(function () {
                $wrap.removeClass('is-loading');
                $submitBtn.prop('disabled', false);
            });
        });

        function executeStageBuild(replaceExistingRows) {
            if (!savedSession.lastBlueprint) {
                return;
            }

            $buildBtn.prop('disabled', true);
            $appendBtn.prop('disabled', true);
            $wrap.addClass('is-loading');

            ensurePrimaryStageReady().then(function (instanceState) {
                return buildNativePageBlueprintIntoStage(
                    instanceState.stageId,
                    savedSession.lastBlueprint,
                    replaceExistingRows
                ).then(function (res) {
                    if (res && res.success) {
                        $response.prepend(
                            '<div class="message message-success"><div>' +
                            escapeHtml(res.summary) +
                            '</div></div>'
                        );
                        var $stageNode = instanceState.$stageWrapper || $('.pagebuilder-stage-wrapper').first();
                        if ($stageNode && $stageNode.length && $stageNode[0].scrollIntoView) {
                            $stageNode[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    } else {
                        renderScaffolderError(
                            (res && res.message) || $t('Failed to build rows onto the stage.'),
                            false,
                            ''
                        );
                    }
                });
            }).catch(function (err) {
                renderScaffolderError(
                    (err && err.message) || $t('Could not initialize Page Builder stage.'),
                    false,
                    ''
                );
            }).always(function () {
                $wrap.removeClass('is-loading');
                $buildBtn.prop('disabled', false);
                $appendBtn.prop('disabled', false);
            });
        }

        $wrap.on('click', '.rb-collab-scaffolder-build', function () {
            executeStageBuild(true);
        });

        $wrap.on('click', '.rb-collab-scaffolder-append', function () {
            executeStageBuild(false);
        });

        return true;
    }

    function schedulePageScaffolderMount() {
        if (mountInlinePageScaffolder()) {
            return;
        }

        var observer = null,
            tries = 0,
            mountTimer = setInterval(function () {
                tries++;
                if (mountInlinePageScaffolder() || tries >= 120) {
                    clearInterval(mountTimer);
                    if (observer) {
                        observer.disconnect();
                    }
                }
            }, 250);

        if (typeof window.MutationObserver === 'function' && document.body) {
            observer = new window.MutationObserver(function () {
                if (mountInlinePageScaffolder()) {
                    clearInterval(mountTimer);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function init(config) {
        runtimeConfig = $.extend(true, {}, runtimeConfig, config || {});
        if (!runtimeConfig.enabled && !(runtimeConfig.ai && runtimeConfig.ai.enabled)) {
            return;
        }

        bindGlobalListeners();
        startPollingIfConfigured();
        fetchInitialAiLicenseStatus();
        schedulePageScaffolderMount();
    }

    function entry(config) {
        init(config);
    }

    entry.init = init;
    entry.registerPageBuilder = registerPageBuilder;
    entry.unregisterPageBuilder = unregisterPageBuilder;
    entry.onFullScreenChange = onFullScreenChange;
    entry.isEnabledForPreview = isEnabledForPreview;
    entry.isAiEnabledForPreview = isAiEnabledForPreview;
    entry.attachPreviewElement = attachPreviewElement;
    entry.openCommentPopoverForPreview = openCommentPopoverForPreview;
    entry.openAiModalForPreview = openAiModalForPreview;
    entry.handleContentTypeDuplicated = handleContentTypeDuplicated;

    return entry;
});
