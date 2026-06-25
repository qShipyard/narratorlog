import { OutputPlugin, DeliverRequest, DeliverResponse, getFinalContent, runOutputPlugin } from '@narratorlog/sdk'

class OutputPluginImpl implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    // TODO: implement email delivery
    const content = getFinalContent(request)
    void content
    return { success: false, error: 'email plugin not yet implemented — contributions welcome!' }
  }
}

runOutputPlugin(new OutputPluginImpl())
