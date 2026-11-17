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
            'column'
        ],
        aiIntegrationEnabled: true,
        ai: {
            enabled: true,
            enablePageScaffolder: true,
            enableStageAi: true,
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
            '<stop offset="0" stop-color="#881337"></stop><stop offset="0.5" stop-color="#e11d48"></stop><stop offset="1" stop-color="#fb923c"></stop>' +
            '</linearGradient></defs>' +
            '<circle cx="256" cy="256" r="220" fill="url(#solcart-mars-grad)"></circle>' +
            '<path d="M446.53 366 A220 220 0 0 1 65.47 366 Q256 323.07 446.53 366 Z" fill="#6b112b"></path>' +
            '<path d="M114.59 87.47 A220 220 0 0 1 397.41 87.47 Q256 116.98 114.59 87.47 Z" fill="#e0f2fe"></path>' +
            '<path d="M366 446.53 A220 220 0 0 1 146 446.53 Q256 427.75 366 446.53 Z" fill="#e0f2fe"></path>' +
            '<path d="M245.27 151.37 L357.95 151.37 L357.95 264.05 L239.9 382.1 Q218.44 403.56 196.98 382.1 L127.22 312.34 Q105.76 290.88 127.22 269.41 Z" fill="none" stroke="#e0f2fe" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"></path>' +
            '<line x1="180.88" y1="306.98" x2="234.54" y2="253.32" stroke="#e0f2fe" stroke-width="24" stroke-linecap="round"></line>' +
            '<polygon points="298.93,164.78 309.37,199.95 344.54,210.39 309.37,220.83 298.93,256 288.49,220.83 253.32,210.39 288.49,199.95" fill="#38bdf8"></polygon>' +
            '</svg>';
    }

    function renderCommentIconSvg(summary, sizePx) {
        var s = sizePx || 18,
            strokeColor = '#0d66d0',
            fillColor = 'rgba(13, 102, 208, 0.10)';

        if (summary && summary.open > 0) {
            if (summary.mentionedMe) {
                strokeColor = '#e11d48';
                fillColor = 'rgba(225, 29, 72, 0.16)';
            } else {
                strokeColor = '#0d66d0';
                fillColor = 'rgba(13, 102, 208, 0.18)';
            }
        } else if (summary && summary.resolved > 0) {
            strokeColor = '#16a34a';
            fillColor = 'rgba(22, 163, 74, 0.15)';
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
            'style="vertical-align:middle;display:inline-block;flex-shrink:0;">' +
            '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" ' +
            'fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
            '<line x1="8.5" y1="10.5" x2="15.5" y2="10.5" stroke="' + strokeColor + '" stroke-width="1.8" stroke-linecap="round"></line>' +
            '<line x1="8.5" y1="14" x2="13" y2="14" stroke="' + strokeColor + '" stroke-width="1.8" stroke-linecap="round"></line>' +
            '</svg>';
    }

    function renderAiSparkleIconSvg(sizePx) {
        var s = sizePx || 18;
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
            'style="vertical-align:middle;display:inline-block;flex-shrink:0;">' +
            '<path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" ' +
            'fill="#e11d48" stroke="#be123c" stroke-width="1.2" stroke-linejoin="round"></path>' +
            '<path d="M19 15L19.9 17.6L22.5 18.5L19.9 19.4L19 22L18.1 19.4L15.5 18.5L18.1 17.6L19 15Z" ' +
            'fill="#0284c7"></path>' +
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
        return type === 'row' || type === 'column-group' || type === 'column';
    }

    function isAiEnabledForPreview(preview) {
        if (!runtimeConfig.ai || !runtimeConfig.ai.enabled || !runtimeConfig.permissions.ai) {
            return false;
        }
        if (runtimeConfig.ai.enableStageAi === false) {
            return false;
        }

        var type = getPreviewContentTypeName(preview);
        return type === 'row' || type === 'column-group' || type === 'column';
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

    function buildMagentoLinkObject(rawUrl, openInNewTab) {
        var u = (rawUrl || '').toString().trim();
        if (!u) {
            return undefined;
        }
        return {
            type: 'default',
            default: u,
            setting: Boolean(openInNewTab)
        };
    }

    function extractMagentoLinkInfo(linkObj) {
        if (!linkObj) {
            return { url: '', newTab: false };
        }
        if (typeof linkObj === 'string') {
            return { url: linkObj.trim(), newTab: false };
        }
        if (typeof linkObj === 'object') {
            var lType = linkObj.type || 'default',
                rawHref = linkObj[lType] || linkObj.default || linkObj.url || linkObj.href || '';
            return {
                url: String(rawHref).trim(),
                newTab: Boolean(linkObj.setting)
            };
        }
        return { url: '', newTab: false };
    }

    function buildMarginsAndPaddingJson(paddingVal) {
        var p = (paddingVal || '').toString().replace('px', '').trim();
        if (!p || isNaN(parseInt(p, 10))) {
            return undefined;
        }
        return JSON.stringify({
            margin: { top: '', right: '', bottom: '', left: '' },
            padding: { top: p, right: p, bottom: p, left: p }
        });
    }

    function applyContainerBoxProps(dataStore, spec) {
        if (!dataStore || !spec) {
            return;
        }
        if (spec.appearance) {
            dataStore.set('appearance', spec.appearance);
        }
        if (spec.min_height) {
            dataStore.set('min_height', String(spec.min_height).replace('px', ''));
        }
        if (spec.vertical_align) {
            dataStore.set('justify_content', spec.vertical_align);
        }
        if (spec.background_color) {
            dataStore.set('background_color', spec.background_color);
        }
        if (spec.text_align) {
            dataStore.set('text_align', spec.text_align);
        }
        if (spec.border) {
            dataStore.set('border', spec.border);
        }
        if (spec.border_color) {
            dataStore.set('border_color', spec.border_color);
        }
        if (spec.border_width) {
            dataStore.set('border_width', String(spec.border_width).replace('px', ''));
        }
        if (spec.border_radius) {
            dataStore.set('border_radius', String(spec.border_radius).replace('px', ''));
        }
        var mp = buildMarginsAndPaddingJson(spec.padding);
        if (mp) {
            dataStore.set('margins_and_padding', mp);
        }
    }

    function serializeChildBlockSummary(ct) {
        if (!ct || !ct.config) {
            return '';
        }
        var type = normalizeType(ct.config.name),
            state = ct.dataStore ? (ct.dataStore.getState() || {}) : {};

        if (type === 'heading') {
            var hAlign = state.text_align ? (', align: ' + state.text_align) : '';
            return '[heading (' + (state.heading_type || 'h2') + hAlign + '): "' + (state.heading_text || '') + '"]';
        }
        if (type === 'text') {
            var plain = $('<div></div>').html(state.content || '').text().trim().slice(0, 240);
            return '[text: "' + plain + '"]';
        }
        if (type === 'buttons') {
            var btnChildren = typeof ct.getChildren === 'function' ? (ct.getChildren()() || []) : [],
                bApp = state.appearance && state.appearance !== 'inline' ? (', appearance: ' + state.appearance) : '',
                bSame = String(state.is_same_width) === 'true' ? ', same_width: true' : '',
                btnDetails = btnChildren.map(function (b) {
                    if (!b.dataStore) {
                        return '"Button"';
                    }
                    var bText = b.dataStore.get('button_text') || 'Button',
                        bTypeRaw = b.dataStore.get('button_type') || 'pagebuilder-button-primary',
                        bShortType = bTypeRaw.indexOf('secondary') !== -1 ? 'secondary' : (bTypeRaw.indexOf('link') !== -1 ? 'link' : 'primary'),
                        lInfo = extractMagentoLinkInfo(b.dataStore.get('button_link')),
                        urlPart = lInfo.url ? (', url: "' + lInfo.url + '"' + (lInfo.newTab ? ' (new tab)' : '')) : ', url: ""';
                    return '"' + bText + '" (type: ' + bShortType + urlPart + ')';
                });
            return '[buttons' + bApp + bSame + ': ' + (btnDetails.join('; ') || '"Button"') + ']';
        }
        if (type === 'banner') {
            var bPlain = $('<div></div>').html(state.message || '').text().trim().slice(0, 140),
                bLinkInfo = extractMagentoLinkInfo(state.link_url),
                bUrlStr = bLinkInfo.url ? (', url: "' + bLinkInfo.url + '"') : '',
                banApp = state.appearance ? (', appearance: ' + state.appearance) : '';
            return '[banner' + banApp + ': "' + bPlain + '", button: "' + (state.button_text || '') + '"' + bUrlStr + ']';
        }
        if (type === 'tabs') {
            var tItems = typeof ct.getChildren === 'function' ? (ct.getChildren()() || []) : [],
                tDesc = tItems.map(function (tCt, idx) {
                    var tName = (tCt.dataStore && tCt.dataStore.get('tab_name')) || ('Tab ' + (idx + 1)),
                        inner = typeof tCt.getChildren === 'function' ? (tCt.getChildren()() || []).map(serializeChildBlockSummary).filter(Boolean).join(' + ') : '';
                    return '"' + tName + '" (' + (inner || 'empty') + ')';
                });
            return '[tabs: ' + tDesc.join('; ') + ']';
        }
        if (type === 'slider') {
            var sItems = typeof ct.getChildren === 'function' ? (ct.getChildren()() || []) : [],
                sDesc = sItems.map(function (sCt, idx) {
                    var sState = sCt.dataStore ? (sCt.dataStore.getState() || {}) : {},
                        sPlain = $('<div></div>').html(sState.content || '').text().trim().slice(0, 80),
                        sLink = extractMagentoLinkInfo(sState.link_url);
                    return 'Slide ' + (idx + 1) + ': "' + sPlain + '", button: "' + (sState.button_text || '') + '"' + (sLink.url ? ', url: "' + sLink.url + '"' : '');
                });
            return '[slider: ' + sDesc.join('; ') + ']';
        }
        if (type === 'divider') {
            return '[divider: color=' + (state.line_color || '#cbd5e1') + ', thickness=' + (state.line_thickness || '1px') + ']';
        }
        if (type === 'video') {
            return '[video: src="' + (state.video_source || '') + '"]';
        }
        if (type === 'image') {
            var imgLink = extractMagentoLinkInfo(state.link_url);
            return '[image: alt="' + (state.alt || '') + '", caption="' + (state.image_caption || '') + '"' + (imgLink.url ? ', url="' + imgLink.url + '"' : '') + ']';
        }
        if (type === 'html') {
            return '[html: "' + String(state.html || '').trim().slice(0, 140) + '"]';
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

    function readPageFormField(fieldName) {
        var $el = $('[name="' + fieldName + '"]').first();
        if ($el.length && ($el.val() || '').toString().trim() !== '') {
            return ($el.val() || '').toString().trim();
        }

        if (typeof window.require === 'function' && window.require.defined && window.require.defined('uiRegistry')) {
            try {
                var reg = window.require('uiRegistry'),
                    comp = reg.get('index = ' + fieldName),
                    val = comp && typeof comp.value === 'function' ? comp.value() : '';
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    return String(val).trim();
                }
                var provider = reg.get('cms_page_form.page_form_data_source') || reg.get('cms_block_form.block_form_data_source');
                if (provider && typeof provider.get === 'function') {
                    var pVal = provider.get('data.' + fieldName);
                    if (pVal !== undefined && pVal !== null && String(pVal).trim() !== '') {
                        return String(pVal).trim();
                    }
                }
            } catch (e) {
                // Ignore registry lookup errors
            }
        }

        return '';
    }

    function expandFieldsetByName(fieldsetIndex) {
        var $fs = $('.fieldset-wrapper[data-index="' + fieldsetIndex + '"]').first();
        if ($fs.length) {
            var $titleBar = $fs.children('.fieldset-wrapper-title').first();
            if ($titleBar.attr('data-state-collapsible') === 'closed') {
                $titleBar.trigger('click');
            }
        }
    }

    function setPageFormField(fieldName, newValue, forceOverwrite) {
        var cleanVal = (newValue === undefined || newValue === null) ? '' : String(newValue).trim();
        if (!cleanVal) {
            return false;
        }

        var currentVal = readPageFormField(fieldName);
        if (currentVal !== '' && !forceOverwrite) {
            return false;
        }

        var updated = false;

        if (typeof window.require === 'function') {
            try {
                window.require(['uiRegistry'], function (reg) {
                    if (!reg) {
                        return;
                    }
                    var provider = reg.get('cms_page_form.page_form_data_source') || reg.get('cms_block_form.block_form_data_source');
                    if (provider && typeof provider.set === 'function') {
                        provider.set('data.' + fieldName, cleanVal);
                    }
                    var comp = reg.get('index = ' + fieldName);
                    if (comp && typeof comp.value === 'function') {
                        comp.value(cleanVal);
                    }
                });
                updated = true;
            } catch (e) {
                // Ignore registry error
            }
        }

        var $el = $('[name="' + fieldName + '"]').first();
        if ($el.length) {
            $el.val(cleanVal).trigger('change');
            updated = true;
        }

        return updated;
    }

    function applyPageFieldsFromBlueprint(pageBlueprint, forceOverwrite) {
        if (!pageBlueprint) {
            return [];
        }

        var pf = $.extend({}, pageBlueprint.page_fields || {});
        if (!pf.title && pageBlueprint.suggested_page_title) {
            pf.title = pageBlueprint.suggested_page_title;
        }

        if (pf.content_heading) {
            expandFieldsetByName('content');
        }
        if (pf.identifier || pf.meta_title || pf.meta_keywords || pf.meta_description) {
            expandFieldsetByName('search_engine_optimisation');
        }
        if (pf.page_layout) {
            expandFieldsetByName('design');
        }

        var fieldLabels = {
                title: $t('Page Title'),
                content_heading: $t('Content Heading'),
                identifier: $t('URL Key'),
                meta_title: $t('Meta Title'),
                meta_keywords: $t('Meta Keywords'),
                meta_description: $t('Meta Description'),
                page_layout: $t('Layout')
            },
            updatedLabels = [];

        Object.keys(fieldLabels).forEach(function (key) {
            if (pf[key] && setPageFormField(key, pf[key], Boolean(forceOverwrite))) {
                updatedLabels.push(fieldLabels[key]);
            }
        });

        setTimeout(function () {
            Object.keys(fieldLabels).forEach(function (key) {
                if (pf[key]) {
                    var $el = $('[name="' + key + '"]').first();
                    if ($el.length && (($el.val() || '').toString().trim() === '' || forceOverwrite)) {
                        $el.val(String(pf[key]).trim()).trigger('change');
                    }
                }
            });
        }, 260);

        return updatedLabels;
    }

    function getWholeStageStructureSummary() {
        var lines = [],
            fieldNames = ['title', 'content_heading', 'identifier', 'meta_title', 'meta_keywords', 'meta_description', 'page_layout'],
            metaParts = [];

        fieldNames.forEach(function (fKey) {
            var val = readPageFormField(fKey);
            if (val) {
                metaParts.push(fKey + ': "' + val + '"');
            }
        });

        if (metaParts.length) {
            lines.push('Current Page Form Fields: ' + metaParts.join(' | '));
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

    function formatHumanBreadcrumbPath(structuralPath, fallbackLabel) {
        if (!structuralPath) {
            return fallbackLabel || $t('Element');
        }

        var typeLabels = {
                row: $t('Row'),
                'column-group': $t('Column Group'),
                column: $t('Column'),
                tabs: $t('Tabs'),
                'tab-item': $t('Tab'),
                slider: $t('Slider'),
                slide: $t('Slide'),
                heading: $t('Heading'),
                text: $t('Text'),
                buttons: $t('Buttons'),
                'button-item': $t('Button'),
                banner: $t('Banner'),
                image: $t('Image'),
                html: $t('HTML Code'),
                divider: $t('Divider'),
                products: $t('Products'),
                video: $t('Video'),
                map: $t('Map'),
                block: $t('Block')
            },
            parts = [];

        String(structuralPath).split('/').forEach(function (seg) {
            var m = seg.match(/^([a-z0-9_-]+):(\d+)$/i);
            if (!m) {
                return;
            }
            var rawType = normalizeType(m[1]),
                idx = parseInt(m[2], 10) + 1;
            if (rawType === 'column-line' || rawType === 'root-container') {
                return;
            }
            var niceName = typeLabels[rawType] || (rawType.charAt(0).toUpperCase() + rawType.slice(1));
            parts.push(niceName + ' #' + idx);
        });

        return parts.length ? parts.join(' › ') : (fallbackLabel || $t('Element'));
    }

    function closeAiModal() {
        $('.rb-collab-ai-modal').remove();
        $('.rb-collab-ai-target-active')
            .removeClass('rb-collab-ai-target-active')
            .removeAttr('data-rb-ai-target-label');
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
            var headingData = {
                heading_type: blockSpec.heading_type || 'h2',
                heading_text: blockSpec.heading_text || 'Section Heading'
            };
            if (blockSpec.text_align) {
                headingData.text_align = blockSpec.text_align;
            }
            return contentTypeFactory(headingCfg, containerContentType, stageId, headingData).then(function (headingCt) {
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

            var buttonsInitData = {};
            if (blockSpec.appearance === 'stacked' || blockSpec.appearance === 'inline') {
                buttonsInitData.appearance = blockSpec.appearance;
            }
            if (blockSpec.is_same_width !== undefined) {
                buttonsInitData.is_same_width = blockSpec.is_same_width ? 'true' : 'false';
            }
            if (blockSpec.text_align) {
                buttonsInitData.text_align = blockSpec.text_align;
            }

            return contentTypeFactory(buttonsCfg, containerContentType, stageId, buttonsInitData).then(function (buttonsCt) {
                if (!buttonsCt) {
                    return null;
                }
                containerContentType.addChild(buttonsCt);

                var btnSpecs = Array.isArray(blockSpec.buttons) && blockSpec.buttons.length
                    ? blockSpec.buttons
                    : [{
                        button_text: blockSpec.button_text || 'Shop Now',
                        button_type: blockSpec.button_type || 'primary',
                        button_link: blockSpec.button_link || blockSpec.link_url || '',
                        open_in_new_tab: Boolean(blockSpec.open_in_new_tab)
                    }];

                var btnChain = Promise.resolve();
                btnSpecs.forEach(function (bItem) {
                    btnChain = btnChain.then(function () {
                        var btnData = {
                                button_text: bItem.button_text || 'Shop Now',
                                button_type: mapMagentoButtonType(bItem.button_type)
                            },
                            linkObj = buildMagentoLinkObject(
                                bItem.button_link || bItem.link_url || blockSpec.button_link || '',
                                bItem.open_in_new_tab !== undefined ? bItem.open_in_new_tab : blockSpec.open_in_new_tab
                            );
                        if (linkObj) {
                            btnData.button_link = linkObj;
                        }
                        return contentTypeFactory(buttonItemCfg, buttonsCt, stageId, btnData).then(function (btnItemCt) {
                            if (btnItemCt) {
                                if (linkObj && btnItemCt.dataStore) {
                                    btnItemCt.dataStore.set('button_link', linkObj);
                                }
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
            var tabsInitData = {};
            if (blockSpec.tabs_alignment) {
                tabsInitData.navigation_alignment = blockSpec.tabs_alignment;
            }
            if (blockSpec.min_height) {
                tabsInitData.min_height = String(blockSpec.min_height).replace('px', '');
            }
            if (blockSpec.default_active !== undefined) {
                tabsInitData.default_active = blockSpec.default_active;
            }
            return contentTypeFactory(tabsCfg, containerContentType, stageId, tabsInitData).then(function (tabsCt) {
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
            var bannerData = {
                    appearance: blockSpec.appearance || 'poster',
                    message: blockSpec.text_content || '<p>Featured Offer</p>',
                    button_text: blockSpec.button_text || '',
                    button_type: mapMagentoButtonType(blockSpec.button_type),
                    show_button: blockSpec.show_button || (blockSpec.button_text ? 'always' : 'never'),
                    show_overlay: blockSpec.show_overlay || (blockSpec.overlay_color ? 'always' : 'never')
                },
                bannerLinkObj = buildMagentoLinkObject(blockSpec.button_link || blockSpec.link_url, blockSpec.open_in_new_tab);
            if (bannerLinkObj) {
                bannerData.link_url = bannerLinkObj;
            }
            if (blockSpec.background_color) {
                bannerData.background_color = blockSpec.background_color;
            }
            if (blockSpec.overlay_color) {
                bannerData.overlay_color = blockSpec.overlay_color;
            }
            if (blockSpec.min_height) {
                bannerData.min_height = blockSpec.min_height;
            }
            return contentTypeFactory(bannerCfg, containerContentType, stageId, bannerData).then(function (bannerCt) {
                if (bannerCt) {
                    if (bannerLinkObj && bannerCt.dataStore) {
                        bannerCt.dataStore.set('link_url', bannerLinkObj);
                    }
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
            var dividerData = {};
            if (blockSpec.line_color) {
                dividerData.line_color = blockSpec.line_color;
            }
            if (blockSpec.line_thickness) {
                dividerData.line_thickness = blockSpec.line_thickness;
            }
            if (blockSpec.line_width) {
                dividerData.line_width = blockSpec.line_width;
            }
            return contentTypeFactory(dividerCfg, containerContentType, stageId, dividerData).then(function (dividerCt) {
                if (dividerCt) {
                    containerContentType.addChild(dividerCt);
                }
                return dividerCt;
            });
        }

        if (rawType === 'video') {
            var videoCfg = pbConfig.getContentTypeConfig('video');
            if (!videoCfg) {
                return Promise.resolve(null);
            }
            return contentTypeFactory(videoCfg, containerContentType, stageId, {
                video_source: blockSpec.video_source || '',
                autoplay: blockSpec.autoplay ? 'true' : 'false'
            }).then(function (videoCt) {
                if (videoCt) {
                    containerContentType.addChild(videoCt);
                }
                return videoCt;
            });
        }

        if (rawType === 'image') {
            var imageCfg = pbConfig.getContentTypeConfig('image');
            if (!imageCfg) {
                return Promise.resolve(null);
            }
            var imgData = {
                    alt: blockSpec.image_alt || '',
                    image_caption: blockSpec.image_caption || ''
                },
                imgLinkObj = buildMagentoLinkObject(blockSpec.button_link || blockSpec.link_url, blockSpec.open_in_new_tab);
            if (imgLinkObj) {
                imgData.link_url = imgLinkObj;
            }
            if (blockSpec.image_url) {
                imgData.image = [{ url: blockSpec.image_url }];
            }
            return contentTypeFactory(imageCfg, containerContentType, stageId, imgData).then(function (imgCt) {
                if (imgCt) {
                    if (imgLinkObj && imgCt.dataStore) {
                        imgCt.dataStore.set('link_url', imgLinkObj);
                    }
                    containerContentType.addChild(imgCt);
                }
                return imgCt;
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
                    bodyHtml = slideSpec.text_content || '<p>Featured slide</p>',
                    slideData = {
                        slide_name: slideSpec.slide_name || slideSpec.heading_text || ($t('Slide') + ' ' + (idx + 1)),
                        appearance: slideSpec.appearance || 'poster',
                        content: headingHtml + bodyHtml,
                        button_text: slideSpec.button_text || 'Shop Now',
                        button_type: mapMagentoButtonType(slideSpec.button_type),
                        show_button: slideSpec.button_text === '' ? 'never' : 'always',
                        show_overlay: slideSpec.show_overlay || (slideSpec.overlay_color ? 'always' : 'never')
                    },
                    slideLinkObj = buildMagentoLinkObject(slideSpec.button_link || slideSpec.link_url, slideSpec.open_in_new_tab);

                if (slideLinkObj) {
                    slideData.link_url = slideLinkObj;
                }
                if (slideSpec.background_color) {
                    slideData.background_color = slideSpec.background_color;
                }
                if (slideSpec.overlay_color) {
                    slideData.overlay_color = slideSpec.overlay_color;
                }
                if (slideSpec.min_height) {
                    slideData.min_height = slideSpec.min_height;
                }

                return contentTypeFactory(slideCfg, sliderCt, stageId, slideData).then(function (slideCt) {
                    if (slideCt) {
                        if (slideLinkObj && slideCt.dataStore) {
                            slideCt.dataStore.set('link_url', slideLinkObj);
                        }
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
                if (existingColGroup.dataStore) {
                    applyContainerBoxProps(existingColGroup.dataStore, {
                        background_color: blueprint.row_background_color,
                        min_height: blueprint.row_min_height,
                        vertical_align: blueprint.row_vertical_align,
                        padding: blueprint.row_padding
                    });
                }

                var groupColPromises = columns.map(function (colSpec) {
                    var colInitData = {
                        width: colSpec.width || '50%'
                    };
                    if (colSpec.appearance) {
                        colInitData.appearance = colSpec.appearance;
                    }
                    if (colSpec.background_color) {
                        colInitData.background_color = colSpec.background_color;
                    }
                    if (colSpec.text_align) {
                        colInitData.text_align = colSpec.text_align;
                    }
                    return contentTypeFactory(colCfg, colParent, stageId, colInitData).then(function (colCt) {
                        if (colCt && colCt.dataStore) {
                            applyContainerBoxProps(colCt.dataStore, colSpec);
                        }
                        return colCt;
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
            if (targetCt.dataStore) {
                applyContainerBoxProps(targetCt.dataStore, columns[0]);
            }
            return populateBlocksSequentially(targetCt, columns[0].blocks || [], stageId).then(function (blockCount) {
                events.trigger('stage:updateAfter', { stageId: stageId });
                return {
                    success: true,
                    summary: $t('Updated %1 native block(s) inside %2.').replace('%1', blockCount).replace('%2', targetType)
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

        if (rowCt && rowCt.dataStore) {
            applyContainerBoxProps(rowCt.dataStore, {
                appearance: blueprint.row_appearance,
                background_color: blueprint.row_background_color,
                min_height: blueprint.row_min_height,
                vertical_align: blueprint.row_vertical_align,
                padding: blueprint.row_padding
            });
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
                    var colInitData = {
                        width: colSpec.width || '50%'
                    };
                    if (colSpec.appearance) {
                        colInitData.appearance = colSpec.appearance;
                    }
                    if (colSpec.background_color) {
                        colInitData.background_color = colSpec.background_color;
                    }
                    if (colSpec.text_align) {
                        colInitData.text_align = colSpec.text_align;
                    }
                    if (colSpec.min_height) {
                        colInitData.min_height = String(colSpec.min_height).replace('px', '');
                    }
                    if (colSpec.vertical_align) {
                        colInitData.justify_content = colSpec.vertical_align;
                    }
                    var colMp = buildMarginsAndPaddingJson(colSpec.padding);
                    if (colMp) {
                        colInitData.margins_and_padding = colMp;
                    }
                    return contentTypeFactory(colCfg, columnParent, stageId, colInitData).then(function (colCt) {
                        if (colCt && colCt.dataStore) {
                            applyContainerBoxProps(colCt.dataStore, colSpec);
                        }
                        return colCt;
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

    function computeRowSpecSignature(rowSpec) {
        if (!rowSpec) {
            return '';
        }
        return JSON.stringify({
            layout_type: rowSpec.layout_type || 'columns',
            row_appearance: rowSpec.row_appearance || '',
            row_background_color: rowSpec.row_background_color || '',
            row_min_height: rowSpec.row_min_height || '',
            row_vertical_align: rowSpec.row_vertical_align || '',
            row_padding: rowSpec.row_padding || '',
            columns: rowSpec.columns || [],
            tabs: rowSpec.tabs || [],
            slides: rowSpec.slides || []
        });
    }

    function isStageRowEmpty(rowCt) {
        if (!rowCt || typeof rowCt.getChildren !== 'function') {
            return true;
        }
        var children = rowCt.getChildren()() || [];
        if (!children.length) {
            return true;
        }
        var cols = collectColumnsInSubtree(rowCt);
        if (cols.length > 0) {
            return cols.every(function (colCt) {
                var colChildren = typeof colCt.getChildren === 'function' ? (colCt.getChildren()() || []) : [];
                return colChildren.length === 0;
            });
        }
        return false;
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

        var existingRows = typeof rootContainer.getChildren === 'function'
            ? [].concat(rootContainer.getChildren()() || [])
            : [];

        if (replaceExistingStage !== false) {
            existingRows.forEach(function (child) {
                rootContainer.removeChild(child);
            });
            existingRows = [];
        } else {
            // In Smart Append / Diff mode, remove only default empty placeholder rows
            existingRows.forEach(function (child) {
                if (isStageRowEmpty(child)) {
                    rootContainer.removeChild(child);
                }
            });
            existingRows = typeof rootContainer.getChildren === 'function'
                ? [].concat(rootContainer.getChildren()() || [])
                : [];
        }

        var updatedFields = applyPageFieldsFromBlueprint(pageBlueprint, false);

        var rowChain = Promise.resolve(),
            addedRowCount = 0,
            updatedRowCount = 0,
            unchangedRowCount = 0;

        rowsList.forEach(function (rowSpec, idx) {
            rowChain = rowChain.then(function () {
                var sig = computeRowSpecSignature(rowSpec),
                    singleRowSpec = $.extend({}, rowSpec, { replace_existing: true });

                if (replaceExistingStage === false) {
                    var matchedStageRow = _.find(existingRows, function (r) {
                        return r && r.rbScaffolderSlot === idx;
                    });
                    if (!matchedStageRow) {
                        matchedStageRow = _.find(existingRows, function (r) {
                            return r && r.rbScaffolderSignature && r.rbScaffolderSignature === sig;
                        });
                    }

                    if (matchedStageRow) {
                        if (matchedStageRow.rbScaffolderSignature === sig) {
                            unchangedRowCount++;
                            return Promise.resolve();
                        }
                        matchedStageRow.rbScaffolderSlot = idx;
                        matchedStageRow.rbScaffolderSignature = sig;
                        updatedRowCount++;
                        return buildNativeLayoutBlueprintIntoPreview({ contentType: matchedStageRow }, singleRowSpec);
                    }
                }

                return contentTypeFactory(rowCfg, rootContainer, stageId, {}).then(function (newRowCt) {
                    if (!newRowCt) {
                        return;
                    }
                    newRowCt.rbScaffolderSlot = idx;
                    newRowCt.rbScaffolderSignature = sig;
                    rootContainer.addChild(newRowCt);
                    addedRowCount++;

                    return buildNativeLayoutBlueprintIntoPreview({ contentType: newRowCt }, singleRowSpec);
                });
            });
        });

        return rowChain.then(function () {
            walkAndAttachStageTree(rootContainer);
            events.trigger('stage:updateAfter', { stageId: stageId });
            refreshAllBadgesForStage(stageId);

            var fieldSuffix = updatedFields.length
                ? ' ' + $t('(Also populated: %1)').replace('%1', updatedFields.join(', '))
                : '';

            var summaryText = replaceExistingStage === false
                ? $t('Smart Diff Applied: %1 row(s) added, %2 updated in place, %3 unchanged preserved.')
                    .replace('%1', addedRowCount)
                    .replace('%2', updatedRowCount)
                    .replace('%3', unchangedRowCount)
                : $t('Built %1 native Row(s) onto the Page Builder stage.').replace('%1', addedRowCount);

            return {
                success: true,
                summary: summaryText + fieldSuffix
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
            previewSnippet = b.buttons.map(function (btn) {
                return btn.button_text + (btn.button_link ? (' → ' + btn.button_link) : '');
            }).join(', ');
        } else {
            previewSnippet = b.heading_text || b.button_text || (b.text_content || '').replace(/<[^>]+>/g, '');
            if (b.button_link) {
                previewSnippet += ' → ' + b.button_link;
            }
        }

        return '<div style="font-size:11px;padding:3px 5px;margin-bottom:3px;background:#f1f5f9;border-radius:3px;">' +
            '<strong>[' + escapeHtml(bType) + ']</strong> ' +
            escapeHtml(String(previewSnippet).slice(0, 84)) +
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
            pf = blueprint.page_fields || {},
            out = '<div class="rb-collab-ai-result is-layout">' +
                '<div class="rb-collab-ai-result-label">&#9889; ' +
                escapeHtml(blueprint.summary || $t('Native PageBuilder Layout Blueprint Ready')) +
                '</div>';

        if (pf.title || pf.content_heading || pf.identifier || pf.meta_title || pf.meta_description || pf.page_layout || blueprint.suggested_page_title) {
            var displayTitle = pf.title || blueprint.suggested_page_title || '';
            out += '<div class="rb-collab-scaffolder-meta-card">' +
                '<div class="rb-collab-scaffolder-meta-header">' +
                '<span class="rb-collab-target-pill">' + escapeHtml($t('PAGE SETTINGS & SEO')) + '</span>' +
                (pf.page_layout ? '<span class="rb-collab-scaffolder-row-meta">' + escapeHtml($t('Layout: ') + pf.page_layout) + '</span>' : '') +
                '</div>' +
                '<div class="rb-collab-scaffolder-meta-grid">' +
                (displayTitle ? '<div><strong>' + escapeHtml($t('Page Title:')) + '</strong> ' + escapeHtml(displayTitle) + '</div>' : '') +
                (pf.content_heading ? '<div><strong>' + escapeHtml($t('Content Heading:')) + '</strong> ' + escapeHtml(pf.content_heading) + '</div>' : '') +
                (pf.identifier ? '<div><strong>' + escapeHtml($t('URL Key:')) + '</strong> <code>' + escapeHtml(pf.identifier) + '</code></div>' : '') +
                (pf.meta_title ? '<div><strong>' + escapeHtml($t('Meta Title:')) + '</strong> ' + escapeHtml(pf.meta_title) + '</div>' : '') +
                (pf.meta_keywords ? '<div><strong>' + escapeHtml($t('Meta Keywords:')) + '</strong> ' + escapeHtml(pf.meta_keywords) + '</div>' : '') +
                (pf.meta_description ? '<div style="grid-column: 1 / -1;"><strong>' + escapeHtml($t('Meta Description:')) + '</strong> ' + escapeHtml(pf.meta_description) + '</div>' : '') +
                '</div>' +
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

        var breadcrumbText = formatHumanBreadcrumbPath(identity.structuralPath, identity.targetLabel),
            rawContextSummary = (getPreviewContextContent(preview) || '').replace(/\s+/g, ' ').trim(),
            contextSnippet = rawContextSummary
                ? rawContextSummary.slice(0, 110) + (rawContextSummary.length > 110 ? '…' : '')
                : $t('Empty %1 container').replace('%1', identity.targetLabel);

        if ($anchor && $anchor.length) {
            $anchor
                .addClass('rb-collab-ai-target-active')
                .attr('data-rb-ai-target-label', '✦ ' + breadcrumbText);
        }

        var $modal = $('<div></div>', { class: 'rb-collab-ai-modal' });

        var html = '<div class="rb-collab-ai-header">' +
            '<div class="rb-collab-ai-title-wrap">' +
            renderAiSparkleIconSvg(18) +
            '<span class="rb-collab-target-pill">' + escapeHtml(identity.targetType.toUpperCase()) + '</span>' +
            '<strong>' + escapeHtml(identity.targetLabel) + ' &bull; ' + escapeHtml($t('Solcart AI')) + '</strong>' +
            '</div>' +
            '<div class="rb-collab-ai-header-right">' +
            '<span class="rb-collab-ai-plan-slot">' + formatAiPlanBadgeHtml() + '</span>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-ai-clear-session" title="' +
            escapeHtml($t('Reset conversation for this element')) + '"' +
            (savedSession.turns.length ? '' : ' style="display:none;"') + '>&#8634;</button>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-ai-close" title="' + escapeHtml($t('Close')) + '">&times;</button>' +
            '</div>' +
            '</div>' +
            '<div class="rb-collab-ai-target-context-bar">' +
            '<div class="rb-collab-ai-target-context-main">' +
            '<span class="rb-collab-ai-target-dot"></span>' +
            '<span class="rb-collab-ai-target-breadcrumb"><strong>' + escapeHtml($t('Selected:')) + '</strong> ' +
            escapeHtml(breadcrumbText) + '</span>' +
            '<button type="button" class="rb-collab-link-btn rb-collab-ai-locate-target" title="' +
            escapeHtml($t('Scroll to and pulse selected element on stage')) + '">' +
            escapeHtml($t('Highlight on Stage')) + '</button>' +
            '</div>' +
            '<div class="rb-collab-ai-target-snippet">' + escapeHtml(contextSnippet) + '</div>' +
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

        $modal.on('click', '.rb-collab-ai-locate-target', function () {
            if ($anchor && $anchor.length && $anchor[0]) {
                if ($anchor[0].scrollIntoView) {
                    $anchor[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                $anchor.addClass('rb-collab-locate-pulse');
                setTimeout(function () {
                    $anchor.removeClass('rb-collab-locate-pulse');
                }, 1800);
            }
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

        function refreshModalContextSnippet() {
            var updatedSummary = (getPreviewContextContent(preview) || '').replace(/\s+/g, ' ').trim(),
                updatedSnippet = updatedSummary
                    ? updatedSummary.slice(0, 110) + (updatedSummary.length > 110 ? '…' : '')
                    : $t('Empty %1 container').replace('%1', identity.targetLabel);
            $modal.find('.rb-collab-ai-target-snippet').text(updatedSnippet);
        }

        function applyCurrentAiResult(resolveThreadAfter) {
            var $resolveBtn = $modal.find('.rb-collab-ai-inject-resolve');

            if (lastResolvedMode === 'layout' && lastBlueprint) {
                $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', true);
                buildNativeLayoutBlueprintIntoPreview(preview, lastBlueprint).then(function (res) {
                    if (res.success) {
                        refreshModalContextSnippet();
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
                }).then(function () {
                    $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', false);
                }, function () {
                    $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', false);
                });
                return;
            }

            var res = injectAiResponseIntoPreview(preview, lastResponseText);
            if (res.success) {
                refreshModalContextSnippet();
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

        if (type === 'column-group') {
            var $cgOpt = $root.hasClass('pagebuilder-column-group')
                ? $root.children('.pagebuilder-options').first()
                : $root.find('> .pagebuilder-column-group > .pagebuilder-options').first();
            if ($cgOpt.length) {
                return $cgOpt;
            }
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
            $optionsBox = resolveOwnOptionsBox(preview, $rootEl),
            $optionsList = ($optionsBox && $optionsBox.length)
                ? $optionsBox.find('.pagebuilder-options-links').first()
                : $();

        if ($optionsBox && $optionsBox.length) {
            $optionsBox.children('.rb-collab-floating-badge-wrap').remove();
            $optionsBox.find('.rb-collab-options-link').remove();
        }
        $mount.children('.rb-collab-floating-badge-wrap, .rb-collab-corner-pin').remove();
        $mount.removeClass('rb-collab-has-open-threads rb-collab-has-resolved-threads');

        if (!runtimeConfig.enableFloatingPins || !pinsVisible) {
            return;
        }

        if (collabEnabled && summary.total > 0) {
            var pinStatusClass = summary.open > 0
                    ? (summary.mentionedMe ? 'is-mention' : 'is-open')
                    : 'is-resolved',
                pinCountLabel = summary.open > 0
                    ? String(summary.open)
                    : ('&#10003; ' + summary.resolved),
                pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
                    'style="vertical-align:middle;display:inline-block;flex-shrink:0;">' +
                    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" ' +
                    'fill="currentColor"></path></svg>';

            var $cornerPin = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-corner-pin ' + pinStatusClass,
                title: $t('%1 comment thread(s) on %2 — click to view').replace('%1', summary.total).replace('%2', identity.targetLabel),
                html: pinSvg + '<span>' + pinCountLabel + '</span>'
            });

            $cornerPin.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                openCommentPopoverForPreview(preview);
            });

            $mount.append($cornerPin);
        }

        if ($optionsList && $optionsList.length) {
            if (collabEnabled) {
                var countHtml = '';
                if (summary.open > 0) {
                    countHtml = '<span class="rb-collab-options-count' +
                        (summary.mentionedMe ? ' is-mention' : ' is-open') + '">' +
                        summary.open + '</span>';
                } else if (summary.resolved > 0) {
                    countHtml = '<span class="rb-collab-options-count is-resolved">&#10003;</span>';
                }

                var $commentLi = $('<li></li>', {
                        class: 'pagebuilder-options-link rb-collab-options-link'
                    }),
                    $commentA = $('<a></a>', {
                        href: '#',
                        class: 'rb-collab-options-btn rb-collab-options-comment',
                        title: summary.total > 0
                            ? $t('%1 comment thread(s) on %2').replace('%1', summary.total).replace('%2', identity.targetLabel)
                            : $t('Add comment on %1').replace('%1', identity.targetLabel),
                        html: renderCommentIconSvg(summary) + countHtml
                    });

                $commentA.on('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    openCommentPopoverForPreview(preview);
                });

                $commentLi.append($commentA);
                $optionsList.append($commentLi);
            }

            if (aiEnabled) {
                var $aiLi = $('<li></li>', {
                        class: 'pagebuilder-options-link rb-collab-options-link'
                    }),
                    $aiA = $('<a></a>', {
                        href: '#',
                        class: 'rb-collab-options-btn rb-collab-options-ai',
                        title: $t('Open Solcart AI Assistant on %1').replace('%1', identity.targetLabel),
                        html: renderAiSparkleIconSvg()
                    });

                $aiA.on('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    openAiModalForPreview(preview);
                });

                $aiLi.append($aiA);
                $optionsList.append($aiLi);
            }
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
                title: $t('Page Comments (%1 open)').replace('%1', pageOpen),
                html: renderCommentIconSvg({ open: pageOpen }, 16) +
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
            title: $t('StageCraft Collaboration Drawer (%1 open / %2 total threads)')
                .replace('%1', openThreads)
                .replace('%2', totalThreads),
            html: renderSolcartMarkSvg(18) +
                '<span class="rb-collab-count-badge">' +
                openThreads + '/' + totalThreads + '</span>'
        });

        $drawerBtn.on('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleCollaborationDrawer(stageId);
        });

        $bar.append($drawerBtn);

        var hasAiMenu = runtimeConfig.ai && runtimeConfig.ai.enabled && runtimeConfig.ai.enableStageAi !== false && runtimeConfig.permissions.ai;
        if (hasAiMenu || runtimeConfig.enableFloatingPins) {
            var $menuWrap = $('<span></span>', {
                class: 'rb-collab-header-dropdown-wrap'
            });

            var $sparkleBtn = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-header-btn rb-collab-header-sparkle-btn',
                title: $t('Solcart AI & Stage Controls'),
                html: renderAiSparkleIconSvg(18) + ' <span style="font-size:10px;line-height:1;">&#9662;</span>'
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
                '.rb-collab-popover, .rb-collab-floating-pill, .rb-collab-corner-pin, .rb-collab-options-btn, .rb-collab-option, .rb-collab-page-comments-btn, .rb-collab-drawer'
            ).length) {
                closePopover();
            }

            if (!$(event.target).closest(
                '.rb-collab-ai-modal, .rb-collab-ai-option, .rb-collab-ai-apply-btn, .rb-collab-pill-ai, .rb-collab-options-btn, .rb-collab-popover-ai-btn'
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

        events.on('column-group:renderAfter', function (args) {
            if (args && args.contentType && args.contentType.preview && args.element) {
                var cgEl = args.element[0] || args.element;
                args.contentType.preview.wrapperElement = cgEl;
                attachPreviewElement(args.contentType.preview, cgEl);
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
        if (!runtimeConfig.ai || !runtimeConfig.ai.enabled || runtimeConfig.ai.enablePageScaffolder === false || !runtimeConfig.permissions.ai) {
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
            renderAiSparkleIconSvg(20) +
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
            escapeHtml($t('Describe the multi-row page, Title, Content Heading, SEO, or Layout (e.g., \'Row 1: Hero banner, Row 2: 3 feature columns, set layout to 1column and fill SEO fields\'), or enter a follow-up prompt...')) +
            '"></textarea>' +
            '<div class="rb-collab-ai-response-wrap rb-collab-scaffolder-response-wrap">' +
            '<div class="rb-collab-ai-loading-facade"><div class="rb-collab-ai-pulse"></div>' +
            '<span>' + escapeHtml($t('Solcart AI is designing your multi-row page blueprint...')) + '</span></div>' +
            '<div class="rb-collab-ai-response rb-collab-scaffolder-response" aria-live="polite"></div>' +
            '</div>' +
            '<div class="rb-collab-ai-actions rb-collab-scaffolder-actions">' +
            '<span class="rb-collab-scaffolder-hint">' +
            escapeHtml($t('Tip: Iteratively refine rows, Title, SEO, and Layout here, then apply to the page and stage.')) +
            '</span>' +
            '<div class="rb-collab-scaffolder-action-btns">' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-scaffolder-apply-fields" disabled title="' +
            escapeHtml($t('Populate Page Title, Content Heading, URL Key, Meta Title/Keywords/Description, and Layout')) + '">' +
            '&#10003; ' + escapeHtml($t('Apply Title, SEO & Layout')) + '</button>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-scaffolder-append" disabled title="' +
            escapeHtml($t('Diff against the stage: preserve unchanged rows, update modified rows in place, and append only newly added rows')) + '">' +
            '+ ' + escapeHtml($t('Smart Append (Diff)')) + '</button>' +
            '<button type="button" class="rb-collab-btn rb-collab-btn-secondary rb-collab-scaffolder-build" disabled title="' +
            escapeHtml($t('Replace all existing rows on the stage with this blueprint')) + '">' +
            '&#9889; ' + escapeHtml($t('Replace Stage')) + '</button>' +
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
            $applyFieldsBtn = $wrap.find('.rb-collab-scaffolder-apply-fields'),
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
            $applyFieldsBtn.prop('disabled', false);
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
            $applyFieldsBtn.prop('disabled', true);
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
            $applyFieldsBtn.prop('disabled', true);
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
                    $applyFieldsBtn.prop('disabled', !hasRows);
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

        function finishStageBuildUi() {
            $wrap.removeClass('is-loading');
            $applyFieldsBtn.prop('disabled', false);
            $buildBtn.prop('disabled', false);
            $appendBtn.prop('disabled', false);
        }

        function executeStageBuild(replaceExistingRows) {
            if (!savedSession.lastBlueprint) {
                return;
            }

            $applyFieldsBtn.prop('disabled', true);
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
            }).then(finishStageBuildUi, finishStageBuildUi);
        }

        $wrap.on('click', '.rb-collab-scaffolder-apply-fields', function () {
            if (!savedSession.lastBlueprint) {
                return;
            }
            var updated = applyPageFieldsFromBlueprint(savedSession.lastBlueprint, true);
            $response.prepend(
                '<div class="message message-success"><div>' +
                escapeHtml(
                    updated.length
                        ? $t('Applied page settings & SEO fields: %1.').replace('%1', updated.join(', '))
                        : $t('Applied page settings & SEO fields.')
                ) +
                '</div></div>'
            );
        });

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
