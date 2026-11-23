<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\DeploymentConfig;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Solcart\StageCraft\Model\Config;

class ConfigTest extends TestCase
{
    /**
     * @var ScopeConfigInterface|MockObject
     */
    private MockObject $scopeConfigMock;

    /**
     * @var DeploymentConfig|MockObject
     */
    private MockObject $deploymentConfigMock;

    /**
     * @var Config
     */
    private Config $config;

    protected function setUp(): void
    {
        $this->scopeConfigMock = $this->createMock(ScopeConfigInterface::class);
        $this->deploymentConfigMock = $this->createMock(DeploymentConfig::class);
        $this->config = new Config($this->scopeConfigMock, $this->deploymentConfigMock);
    }

    public function testIsEnabledReturnsBooleanFlag(): void
    {
        $this->scopeConfigMock
            ->expects($this->once())
            ->method('isSetFlag')
            ->with(Config::XML_PATH_ENABLED)
            ->willReturn(true);

        $this->assertTrue($this->config->isEnabled());
    }

    public function testGetEnabledContentTypesParsesAndNormalizesCsv(): void
    {
        $this->scopeConfigMock
            ->expects($this->once())
            ->method('getValue')
            ->with(Config::XML_PATH_ENABLED_CONTENT_TYPES)
            ->willReturn(' Row, TEXT , banner,row , ');

        $this->assertSame(['row', 'text', 'banner'], $this->config->getEnabledContentTypes());
    }

    public function testGetEnabledContentTypesFallsBackToRowWhenEmpty(): void
    {
        $this->scopeConfigMock
            ->expects($this->once())
            ->method('getValue')
            ->with(Config::XML_PATH_ENABLED_CONTENT_TYPES)
            ->willReturn('   ');

        $this->assertSame(['row'], $this->config->getEnabledContentTypes());
    }

    public function testGetPollingIntervalClampsNegativeToZero(): void
    {
        $this->scopeConfigMock
            ->expects($this->once())
            ->method('getValue')
            ->with(Config::XML_PATH_POLLING_INTERVAL)
            ->willReturn('-15');

        $this->assertSame(0, $this->config->getPollingInterval());
    }

    public function testGetAiGatewayBaseUrlUsesDeploymentConfigWhenPresent(): void
    {
        $this->deploymentConfigMock
            ->expects($this->once())
            ->method('get')
            ->with(Config::DEPLOYMENT_CONFIG_GATEWAY_URL, '')
            ->willReturn('https://ai.solcart.workers.dev');

        $this->assertSame('https://ai.solcart.workers.dev', $this->config->getAiGatewayBaseUrl());
    }

    public function testGetAiGatewayBaseUrlFallsBackToDefault(): void
    {
        $this->deploymentConfigMock
            ->expects($this->once())
            ->method('get')
            ->with(Config::DEPLOYMENT_CONFIG_GATEWAY_URL, '')
            ->willReturn('');

        $this->assertSame(Config::DEFAULT_GATEWAY_URL, $this->config->getAiGatewayBaseUrl());
    }

    public function testIsDemoModeReadsDeploymentConfigFlag(): void
    {
        $this->deploymentConfigMock
            ->method('get')
            ->willReturnMap([
                [Config::DEPLOYMENT_CONFIG_DEMO_MODE, null, true],
            ]);

        $this->assertTrue($this->config->isDemoMode());
    }
}
