<?php
/**
 * Copyright © Solcart Commerce. All rights reserved.
 * See LICENSE.txt for license details.
 */

declare(strict_types=1);

namespace Solcart\StageCraft\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

class ContentTypes implements OptionSourceInterface
{
    /**
     * @inheritdoc
     */
    public function toOptionArray(): array
    {
        return [
            ['value' => 'row', 'label' => __('Row')],
            ['value' => 'column', 'label' => __('Column')],
            ['value' => 'column-group', 'label' => __('Column Group')],
            ['value' => 'text', 'label' => __('Text')],
            ['value' => 'heading', 'label' => __('Heading')],
            ['value' => 'banner', 'label' => __('Banner')],
            ['value' => 'slider', 'label' => __('Slider')],
            ['value' => 'slide', 'label' => __('Slide')],
            ['value' => 'html', 'label' => __('HTML Code')],
            ['value' => 'image', 'label' => __('Image')],
            ['value' => 'buttons', 'label' => __('Buttons')],
            ['value' => 'button-item', 'label' => __('Button Item')],
            ['value' => 'block', 'label' => __('Dynamic / CMS Block')],
            ['value' => 'products', 'label' => __('Products')],
            ['value' => 'tabs', 'label' => __('Tabs')],
            ['value' => 'tab-item', 'label' => __('Tab Item')],
            ['value' => 'video', 'label' => __('Video')],
            ['value' => 'map', 'label' => __('Map')],
            ['value' => 'divider', 'label' => __('Divider')],
        ];
    }
}
