<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\HTTP\Client\Curl;
use Magento\Framework\HTTP\Client\CurlFactory;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Solcart\StageCraft\Model\AiGatewayService;
use Solcart\StageCraft\Model\Config;

class AiGatewayServiceTest extends TestCase
{
    /**
     * @var CurlFactory|MockObject
     */
    private MockObject $curlFactoryMock;

    /**
     * @var Curl|MockObject
     */
    private MockObject $curlMock;

    /**
     * @var Config|MockObject
     */
    private MockObject $configMock;

    /**
     * @var StoreManagerInterface|MockObject
     */
    private MockObject $storeManagerMock;

    /**
     * @var LoggerInterface|MockObject
     */
    private MockObject $loggerMock;

    /**
     * @var AiGatewayService
     */
    private AiGatewayService $service;

    protected function setUp(): void
    {
        $this->curlFactoryMock = $this->createMock(CurlFactory::class);
        $this->curlMock = $this->createMock(Curl::class);
        $this->curlFactoryMock->method('create')->willReturn($this->curlMock);

        $this->configMock = $this->createMock(Config::class);
        $this->storeManagerMock = $this->createMock(StoreManagerInterface::class);
        $this->loggerMock = $this->createMock(LoggerInterface::class);

        $storeMock = $this->createMock(Store::class);
        $storeMock->method('getBaseUrl')->willReturn('https://magento2.docker/');
        $this->storeManagerMock->method('getStore')->willReturn($storeMock);

        $this->service = new AiGatewayService(
            $this->curlFactoryMock,
            $this->configMock,
            $this->storeManagerMock,
            new Json(),
            $this->loggerMock
        );
    }

    public function testGenerateThrowsExceptionWhenAiIsDisabled(): void
    {
        $this->configMock->method('isAiEnabled')->willReturn(false);

        $this->expectException(LocalizedException::class);
        $this->service->generate('Rewrite hero headline');
    }

    public function testGenerateReturnsFormattedGatewayResponse(): void
    {
        $this->configMock->method('isAiEnabled')->willReturn(true);
        $this->configMock->method('getAiGatewayBaseUrl')->willReturn('http://host.docker.internal:8787');
        $this->configMock->method('getAiTimeout')->willReturn(45);
        $this->configMock->method('getAiLicenseKey')->willReturn('slc_trial_123');
        $this->configMock->method('getAiBrandVoice')->willReturn('Modern and concise');

        $this->curlMock->expects($this->once())->method('post');
        $this->curlMock->method('getStatus')->willReturn(200);
        $this->curlMock->method('getBody')->willReturn(json_encode([
            'success' => true,
            'response' => '<h2>Summer Sale</h2>',
            'usage' => [
                'plan' => 'trial',
                'credits_remaining' => 99,
            ],
        ]));

        $result = $this->service->generate('Write a heading', 'build', 'heading', 'Old heading');

        $this->assertTrue($result['success']);
        $this->assertSame('<h2>Summer Sale</h2>', $result['response']);
        $this->assertSame(99, $result['usage']['credits_remaining']);
    }

    public function testGenerateHandlesPaymentRequired402Status(): void
    {
        $this->configMock->method('isAiEnabled')->willReturn(true);
        $this->configMock->method('getAiGatewayBaseUrl')->willReturn('http://host.docker.internal:8787');
        $this->configMock->method('getAiTimeout')->willReturn(45);

        $this->curlMock->method('getStatus')->willReturn(402);
        $this->curlMock->method('getBody')->willReturn(json_encode([
            'payment_required' => true,
            'error' => 'Trial expired.',
            'usage' => [
                'plan' => 'expired',
                'credits_remaining' => 0,
                'upgrade_url' => 'https://solcart.ai/billing/upgrade',
            ],
        ]));

        $result = $this->service->generate('Write copy', 'ask');

        $this->assertFalse($result['success']);
        $this->assertTrue($result['payment_required']);
        $this->assertSame('https://solcart.ai/billing/upgrade', $result['usage']['upgrade_url']);
    }

    public function testAuditPageReturnsStructuredAuditItems(): void
    {
        $this->configMock->method('isAiEnabled')->willReturn(true);
        $this->configMock->method('getAiGatewayBaseUrl')->willReturn('https://solcart-ai-gateway.robelrb.workers.dev');
        $this->configMock->method('getAiTimeout')->willReturn(45);

        $this->curlMock->expects($this->once())->method('post');
        $this->curlMock->method('getStatus')->willReturn(200);
        $this->curlMock->method('getBody')->willReturn(json_encode([
            'success' => true,
            'items' => [
                [
                    'target_id' => 'rbc-row-1',
                    'structural_path' => 'row:0',
                    'target_label' => 'Row #1',
                    'comment_text' => '[High Impact] Add a clear CTA button above the fold.',
                ],
            ],
            'usage' => [
                'plan' => 'trial',
                'credits_remaining' => 98,
            ],
        ]));

        $result = $this->service->auditPage([
            ['target_id' => 'rbc-row-1', 'structural_path' => 'row:0', 'content' => 'Welcome to store'],
        ], 'Home Page');

        $this->assertTrue($result['success']);
        $this->assertCount(1, $result['items']);
        $this->assertSame('rbc-row-1', $result['items'][0]['target_id']);
    }

    public function testActivateTrialReturnsProvisionedLicenseKey(): void
    {
        $this->configMock->method('getAiGatewayBaseUrl')->willReturn('https://solcart-ai-gateway.robelrb.workers.dev');

        $this->curlMock->expects($this->once())->method('post');
        $this->curlMock->method('getStatus')->willReturn(200);
        $this->curlMock->method('getBody')->willReturn(json_encode([
            'success' => true,
            'license_key' => 'slc_trial_e9d12cc1f2a090a7',
            'usage' => [
                'plan' => 'trial',
                'credits_remaining' => 100,
                'trial_days_left' => 14,
            ],
        ]));

        $result = $this->service->activateTrial();

        $this->assertTrue($result['success']);
        $this->assertSame('slc_trial_e9d12cc1f2a090a7', $result['license_key']);
    }
}
