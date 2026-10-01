import { useEffect } from 'react'

interface PaymentOption {
  name: string
  description: string
  url: string
  icon: string
}

const paymentOptions: PaymentOption[] = [
  {
    name: 'GitHub Sponsors',
    description: 'Support via GitHub',
    url: 'https://github.com/sponsors/campbellkearns',
    icon: '💝'
  },
  {
    name: 'PayPal',
    description: 'Direct donation option',
    url: 'https://paypal.me/',
    icon: '💳'
  }
]

export default function SupportPage(): JSX.Element {
  useEffect(() => {
    // Set page title and meta tags for social sharing
    document.title = 'Support Development - Stream Chameleon'

    const metaTags = [
      { property: 'og:title', content: 'Support Stream Chameleon' },
      { property: 'og:description', content: 'Help keep Stream Chameleon free and open. Support development with a donation.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'Support Stream Chameleon' },
      { name: 'twitter:description', content: 'Keep Stream Chameleon free for everyone' }
    ]

    metaTags.forEach(({ property, name, content }) => {
      let meta = property
        ? document.querySelector(`meta[property="${property}"]`)
        : document.querySelector(`meta[name="${name}"]`)

      if (!meta) {
        meta = document.createElement('meta')
        if (property) {
          meta.setAttribute('property', property)
        } else if (name) {
          meta.setAttribute('name', name)
        }
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', content)
    })

    // Cleanup on unmount
    return () => {
      document.title = 'Stream Chameleon'
    }
  }, [])

  return (
    <div>
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-4xl font-medium text-fg-strong mb-3">
          Support Development
        </h1>
        <p className="text-lg text-fg-muted">
          Stream Chameleon is free and always will be. Your support helps me
          maintain the app and add new features.
        </p>
        <p className="text-lg text-fg-muted">
          Whether it's a one-time donation or monthly support, every contribution
          makes a difference.
        </p>
      </div>

      {/* Payment Options Grid */}
      <div className="mb-8">
        <h2 className="text-2xl font-medium text-fg-strong mb-6">
          Choose your platform
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {paymentOptions.map((option) => (
            <div key={option.name} className="card">
              <div className="flex items-center space-x-3 mb-3">
                <span className="text-3xl">{option.icon}</span>
                <h3 className="text-xl font-medium text-fg-strong">
                  {option.name}
                </h3>
              </div>
              <p className="text-fg-muted mb-4">
                {option.description}
              </p>
              <a
                href={option.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn w-full text-center block"
              >
                Support via {option.name}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Why Support Section */}
      <div className="flex flex-col items-center mb-4">
        <h2 className="text-2xl font-medium text-fg-strong mb-4">
          Your support helps with:
        </h2>
        <ul className="space-y-2 text-fg">
          <li className="flex items-start space-x-2">
            <span className="text-accent-fg">✓</span>
            <span>Adding requested features faster</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-accent-fg">✓</span>
            <span>Keeping ads and paywalls away</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-accent-fg">✓</span>
            <span>Supporting open source development</span>
          </li>
        </ul>
      </div>


      {/* Thank You Section */}
      <div className="text-center pt-8">
        <p className="text-lg text-fg-muted">
          Thanks for supporting the future of Stream Chameleon!
        </p>
        <p className="text-fg-muted mt-2">
          Together, we're building the best stream management tool for Twitch creators.
        </p>
      </div>
    </div>
  )
}
