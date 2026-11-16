<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Api;

use Magento\Framework\Exception\LocalizedException;

/**
 * Service contract for communicating with the managed Solcart AI Gateway.
 *
 * @api
 */
interface AiGatewayServiceInterface
{
    /**
     * Send an AI generation request (ask or build mode) to the Solcart AI Gateway.
     *
     * @param string $prompt
     * @param string $mode
     * @param string|null $contextType
     * @param string|null $contextContent
     * @param array $commentThread
     * @return array
     * @throws LocalizedException
     */
    public function generate(
        string $prompt,
        string $mode = 'ask',
        ?string $contextType = null,
        ?string $contextContent = null,
        array $commentThread = []
    ): array;

    /**
     * Run an AI Page Audit across the provided Page Builder stage rows/blocks.
     *
     * @param array $rows
     * @param string|null $pageTitle
     * @return array
     * @throws LocalizedException
     */
    public function auditPage(array $rows, ?string $pageTitle = null): array;

    /**
     * Activate or retrieve a persistent 14-day Solcart AI trial key for the current store domain.
     *
     * @return array
     * @throws LocalizedException
     */
    public function activateTrial(): array;

    /**
     * Retrieve current workspace license/trial and credit status from the Solcart AI Gateway.
     *
     * @return array
     */
    public function getLicenseStatus(): array;
}
