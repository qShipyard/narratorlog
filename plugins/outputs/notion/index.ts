import { OutputPlugin, DeliverRequest, DeliverResponse, getFinalContent, runOutputPlugin } from '@narratorlog/sdk'

class OutputPluginImpl implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    // TODO: implement notion delivery
    const content = getFinalContent(request)
    void content
    return { success: false, error: 'notion plugin not yet implemented — contributions welcome!' }
  }
}

runOutputPlugin(new OutputPluginImpl())
