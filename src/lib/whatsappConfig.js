// WhatsApp Embedded Signup config.
// Fill these once Quvera's Meta app is set up (Tech Provider + Embedded Signup
// configuration created, App Review approved). They are public values.
//   FB_APP_ID    : the Meta app's App ID
//   ES_CONFIG_ID : the Embedded Signup "configuration ID" from the Meta app
export const WA = {
  FB_APP_ID: '',        // e.g. '1234567890123456'
  ES_CONFIG_ID: '',     // e.g. '9876543210987654'
  GRAPH_VERSION: 'v21.0',
}

// One-click connect is available only when the platform IDs are configured.
export const waReady = () => !!(WA.FB_APP_ID && WA.ES_CONFIG_ID)
