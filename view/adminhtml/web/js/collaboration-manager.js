/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

define([
    'jquery',
    'underscore',
    'mage/translate',
    'Magento_PageBuilder/js/events'
], function ($, _, $t, events) {
    'use strict';

    var runtimeConfig = {
        enabled: false,
        enablePageComments: true,
        enableFloatingPins: true,
        enabledContentTypes: ['row', 'column', 'text', 'heading', 'banner', 'slide', 'html', 'image', 'buttons'],
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

    function getPreviewContextContent(preview) {
        if (preview && preview.wrapperElement) {
            return ($(preview.wrapperElement).text() || '').trim().slice(0, 4000);
        }

        return '';
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

    function openAiModalForPreview(preview, initialPrompt, initialMode, threadContext) {
        if (!preview || !isAiEnabledForPreview(preview)) {
            return;
        }

        closePopover();
        closeAiModal();

        var lastResponseText = '',
            defaultMode = initialMode === 'build' ? 'build' : 'ask',
            identity = resolvePreviewIdentity(preview, false),
            stageId = preview.contentType && preview.contentType.stageId,
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
                : null,
            blockType = identity.targetType;

        var $modal = $('<div></div>', { class: 'rb-collab-ai-modal' });

        var html = '<div class="rb-collab-ai-header">' +
            '<div class="rb-collab-ai-title-wrap">' +
            '<span class="rb-collab-target-pill">' + escapeHtml(identity.targetType.toUpperCase()) + '</span>' +
            '<strong>' + escapeHtml($t('Solcart AI Assistant')) + '</strong>' +
            '</div>' +
            '<div class="rb-collab-ai-header-right">' +
            '<span class="rb-collab-ai-plan-slot">' + formatAiPlanBadgeHtml() + '</span>' +
            '<button type="button" class="rb-collab-icon-btn rb-collab-ai-close" title="' + escapeHtml($t('Close')) + '">&times;</button>' +
            '</div>' +
            '</div>';

        var scaffoldChipsHtml = '';
        if (blockType === 'row' || blockType === 'html' || blockType === 'column') {
            scaffoldChipsHtml =
                '<button type="button" class="rb-collab-ai-chip" data-mode="build" data-prompt="Generate a responsive 3-column feature grid section in clean HTML with icons, bold headings, and concise benefit descriptions.">' +
                '&#9889; ' + escapeHtml($t('Scaffold 3-Col Features')) + '</button>' +
                '<button type="button" class="rb-collab-ai-chip" data-mode="build" data-prompt="Generate a high-converting eCommerce Hero Callout section in responsive HTML with headline, value proposition subheadline, and primary CTA button.">' +
                '&#9889; ' + escapeHtml($t('Scaffold Hero Section')) + '</button>';
        }

        html += '<div class="rb-collab-ai-body">' +
            '<div class="rb-collab-ai-mode-row">' +
            '<label class="rb-collab-ai-radio"><input type="radio" name="rb-collab-ai-mode" value="ask"' +
            (defaultMode === 'ask' ? ' checked' : '') + '> ' + escapeHtml($t('Ask / Review')) + '</label>' +
            '<label class="rb-collab-ai-radio"><input type="radio" name="rb-collab-ai-mode" value="build"' +
            (defaultMode === 'build' ? ' checked' : '') + '> ' + escapeHtml($t('Build Content (HTML)')) + '</label>' +
            '</div>' +
            '<div class="rb-collab-ai-quick-chips">' +
            '<button type="button" class="rb-collab-ai-chip" data-mode="build" data-prompt="Improve the copy in this block to be clearer and more persuasive.">' +
            escapeHtml($t('Improve Copy')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-mode="build" data-prompt="Shorten this content for mobile readers while keeping the key message.">' +
            escapeHtml($t('Shorten')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-mode="build" data-prompt="Fix grammar, spelling, and polish the tone of this block.">' +
            escapeHtml($t('Fix Grammar')) + '</button>' +
            '<button type="button" class="rb-collab-ai-chip" data-mode="ask" data-prompt="Critique this block and suggest 3 conversion improvements.">' +
            escapeHtml($t('Conversion Audit')) + '</button>' +
            scaffoldChipsHtml +
            '</div>' +
            '<textarea class="rb-collab-ai-input" rows="4" placeholder="' +
            escapeHtml($t('Describe what to generate, rewrite, or analyze for %1...').replace('%1', identity.targetLabel)) +
            '"></textarea>' +
            '<div class="rb-collab-ai-response-wrap">' +
            '<div class="rb-collab-ai-loading-facade"><div class="rb-collab-ai-pulse"></div>' +
            '<span>' + escapeHtml($t('Contacting Solcart AI...')) + '</span></div>' +
            '<div class="rb-collab-ai-response" aria-live="polite"></div>' +
            '</div>' +
            '<div class="rb-collab-ai-actions">' +
            '<button type="button" class="action-default rb-collab-ai-inject" disabled' +
            (defaultMode === 'build' ? '' : ' style="display:none;"') + '><span>' + escapeHtml($t('Inject into Block')) + '</span></button>' +
            (threadIdToResolve && runtimeConfig.permissions.resolve
                ? '<button type="button" class="action-primary rb-collab-ai-inject-resolve" disabled' +
                  (defaultMode === 'build' ? '' : ' style="display:none;"') + '><span>&#10003; ' +
                  escapeHtml($t('Inject & Resolve Thread')) + '</span></button>'
                : '') +
            '<button type="button" class="action-default rb-collab-ai-cancel"><span>' + escapeHtml($t('Cancel')) + '</span></button>' +
            '<button type="button" class="action-primary rb-collab-ai-submit"><span>&#10022; ' + escapeHtml($t('Send')) + '</span></button>' +
            '</div>' +
            '</div>';

        $modal.html(html);

        if (initialPrompt && typeof initialPrompt === 'string') {
            $modal.find('.rb-collab-ai-input').val(initialPrompt);
        }

        $container.append($modal);
        positionPopover($modal, $anchor, $container);

        function getSelectedAiMode() {
            return $modal.find('input[name="rb-collab-ai-mode"]:checked').val() || 'ask';
        }

        function renderAiOutput(text, mode) {
            var escaped = escapeHtml(text || '');
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

        $modal.on('click', '.rb-collab-ai-close, .rb-collab-ai-cancel', function () {
            closeAiModal();
        });

        $modal.on('change', 'input[name="rb-collab-ai-mode"]', function () {
            var mode = getSelectedAiMode();
            $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve')
                .toggle(mode === 'build')
                .prop('disabled', mode !== 'build' || !lastResponseText.trim());
            if (lastResponseText.trim()) {
                renderAiOutput(lastResponseText, mode);
            }
        });

        $modal.on('click', '.rb-collab-ai-chip', function () {
            var chipPrompt = $(this).attr('data-prompt') || '',
                chipMode = $(this).attr('data-mode') || 'ask';

            $modal.find('input[name="rb-collab-ai-mode"][value="' + chipMode + '"]')
                .prop('checked', true)
                .trigger('change');
            $modal.find('.rb-collab-ai-input').val(chipPrompt).trigger('focus');
        });

        $modal.on('click', '.rb-collab-ai-submit', function () {
            var prompt = ($modal.find('.rb-collab-ai-input').val() || '').trim(),
                mode = getSelectedAiMode();

            if (!prompt) {
                renderAiError($t('Please enter a prompt.'), false, '');
                return;
            }

            $modal.addClass('is-loading');
            $modal.find('.rb-collab-ai-submit, .rb-collab-ai-inject, .rb-collab-ai-inject-resolve').prop('disabled', true);
            $modal.find('.rb-collab-ai-response').empty();

            $.ajax({
                url: runtimeConfig.urls.aiChat,
                method: 'POST',
                dataType: 'json',
                data: {
                    form_key: window.FORM_KEY || runtimeConfig.formKey,
                    prompt: prompt,
                    mode: mode,
                    context_type: getPreviewContentTypeName(preview),
                    context_content: getPreviewContextContent(preview),
                    comment_thread: commentThreadMessages.length ? JSON.stringify(commentThreadMessages) : ''
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
                    renderAiOutput(lastResponseText, mode);
                    if (mode === 'build') {
                        $modal.find('.rb-collab-ai-inject, .rb-collab-ai-inject-resolve')
                            .show()
                            .prop('disabled', lastResponseText.trim() === '');
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

        $modal.on('click', '.rb-collab-ai-inject', function () {
            var res = injectAiResponseIntoPreview(preview, lastResponseText);
            if (res.success) {
                $modal.find('.rb-collab-ai-response').prepend(
                    '<div class="message message-success"><div>' +
                    escapeHtml($t('Injected into %1.').replace('%1', res.key)) +
                    '</div></div>'
                );
                return;
            }
            renderAiError(res.message || $t('Injection failed.'), false, '');
        });

        $modal.on('click', '.rb-collab-ai-inject-resolve', function () {
            var $btn = $(this),
                res = injectAiResponseIntoPreview(preview, lastResponseText);

            if (!res.success) {
                renderAiError(res.message || $t('Injection failed.'), false, '');
                return;
            }

            if (threadIdToResolve && stageId) {
                updateCommentStatus(stageId, threadIdToResolve, 'resolved', $btn);
                closeAiModal();
            }
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

        return $wrapper;
    }

    function renderPreviewFloatingBadge(preview) {
        if (!preview || !preview.wrapperElement || !isEnabledForPreview(preview)) {
            return;
        }

        var contentType = preview.contentType,
            stageId = contentType && contentType.stageId,
            instanceState = instancesByStageId[stageId];

        if (!instanceState) {
            return;
        }

        var $mount = findBadgeMountTarget(preview, preview.wrapperElement),
            type = getPreviewContentTypeName(preview),
            identity = resolvePreviewIdentity(preview, false),
            threads = getThreadsForTarget(instanceState, identity),
            summary = summarizeTargetThreads(threads);

        $mount.attr('data-rb-collab-id', identity.targetId);
        $mount.attr('data-rb-structural-path', identity.structuralPath);

        $mount.find('> .rb-collab-floating-badge-wrap').remove();
        $mount.toggleClass('rb-collab-has-open-threads', summary.open > 0);
        $mount.toggleClass('rb-collab-has-resolved-threads', summary.open === 0 && summary.resolved > 0);

        if (!runtimeConfig.enableFloatingPins || !pinsVisible) {
            return;
        }

        if (summary.total === 0 && type !== 'row') {
            return;
        }

        var $badgeWrap = $('<div></div>', {
            class: 'rb-collab-floating-badge-wrap' +
                (type === 'row' ? ' rb-collab-floating-badge-row' : ' rb-collab-floating-badge-element') +
                (summary.total === 0 ? ' rb-collab-floating-badge-empty' : '')
        });

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

        if (isAiEnabledForPreview(preview)) {
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

        $mount.append($badgeWrap);
    }

    function refreshAllBadgesForStage(stageId) {
        var previews = previewsByStageId[stageId] || [];

        previews.forEach(function (preview) {
            if (preview && preview.wrapperElement && $.contains(document.documentElement, preview.wrapperElement)) {
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
            html: '<span class="rb-collab-btn-icon">&#128172;</span> ' +
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

        if (runtimeConfig.ai && runtimeConfig.ai.enabled && runtimeConfig.permissions.ai && runtimeConfig.urls.aiAudit) {
            var $auditBtn = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-header-btn rb-collab-ai-audit-btn',
                title: $t('Audit stage rows with @AI-Reviewer and post actionable review threads'),
                html: '<span>&#10022; ' + escapeHtml($t('Run AI Page Audit')) + '</span>'
            });

            $auditBtn.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                runStageAiAudit(stageId, $auditBtn);
            });

            $bar.append($auditBtn);

            var $planChip = $('<a></a>', {
                href: aiUsageState.upgrade_url || '#',
                target: '_blank',
                rel: 'noopener',
                class: 'rb-collab-header-plan-link',
                title: $t('Manage Solcart AI Subscription & Billing'),
                html: formatAiPlanBadgeHtml()
            });

            if (!aiUsageState.upgrade_url) {
                $planChip.on('click', function (event) {
                    event.preventDefault();
                });
            }

            $bar.append($planChip);
        }

        if (runtimeConfig.enableFloatingPins) {
            var $pinsBtn = $('<button></button>', {
                type: 'button',
                class: 'rb-collab-header-btn rb-collab-pins-toggle-btn' + (pinsVisible ? ' is-active' : ''),
                title: $t('Toggle Floating Row Comment Badges'),
                html: '<span>&#128204; ' + escapeHtml(pinsVisible ? $t('Pins: On') : $t('Pins: Off')) + '</span>'
            });

            $pinsBtn.on('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                pinsVisible = !pinsVisible;
                Object.keys(instancesByStageId).forEach(function (sId) {
                    renderStageHeaderToolbar(instancesByStageId[sId]);
                    refreshAllBadgesForStage(sId);
                });
            });

            $bar.append($pinsBtn);
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
            '<span>&#128172; ' + escapeHtml($t('StageCraft Activity')) + '</span>' +
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
                        '<button type="button" class="action-default rb-collab-reply-cancel">' + escapeHtml($t('Cancel')) + '</button>' +
                        '<button type="button" class="action-primary rb-collab-reply-submit" data-parent-id="' +
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
                '<button type="button" class="action-primary rb-collab-submit-comment">' +
                '<span>' + escapeHtml($t('Post Comment')) + '</span>' +
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

            openAiModalForPreview(
                preview,
                promptLines.join('\n'),
                'build',
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
            if (runtimeConfig.enabled) {
                loadInstanceComments(stageId);
            }

            events.on('stage:updateAfter', function (args) {
                if (args && args.stageId === stageId) {
                    _.defer(function () {
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
        });

        $(document).on('keydown.rbCollab', function (event) {
            if (event.key === 'Escape') {
                closePopover();
                closeAiModal();
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
            }
        });
    }

    function init(config) {
        runtimeConfig = $.extend(true, {}, runtimeConfig, config || {});
        if (!runtimeConfig.enabled && !(runtimeConfig.ai && runtimeConfig.ai.enabled)) {
            return;
        }

        bindGlobalListeners();
        startPollingIfConfigured();
        fetchInitialAiLicenseStatus();
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
