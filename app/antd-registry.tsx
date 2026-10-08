'use client'

import { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs'
import CacheEntity from '@ant-design/cssinjs/es/Cache'

/**
 * Same as `@ant-design/nextjs-registry`, except the server-side cache is built
 * without `createCache()`: it calls `Math.random()` during render, which
 * `cacheComponents` rejects at prerender. On the server `createCache()` is only
 * `new CacheEntity(randomId)`, and the id is never sent to the client.
 */
export function AntdRegistry({ children }: { children: React.ReactNode }) {
  const [cache] = useState(() =>
    typeof window === 'undefined' ? new CacheEntity('ssr') : createCache(),
  )

  useServerInsertedHTML(() => {
    const styleText = extractStyle(cache, { plain: true, once: true })
    if (styleText.includes('.data-ant-cssinjs-cache-path{content:"";}')) {
      return null
    }
    return (
      <style
        id="antd-cssinjs"
        // Insert before styles antd generates on the client
        data-rc-order="prepend"
        data-rc-priority="-1000"
        dangerouslySetInnerHTML={{ __html: styleText }}
      />
    )
  })

  return <StyleProvider cache={cache}>{children}</StyleProvider>
}
