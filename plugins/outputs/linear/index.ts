import { OutputPlugin, DeliverRequest, DeliverResponse, getFinalContent, runOutputPlugin } from '@narratorlog/sdk'

class OutputPluginImpl implements OutputPlugin {
  async deliver(request: DeliverRequest): Promise<DeliverResponse> {
    // TODO: implement linear delivery
    const content = getFinalContent(request)
    void content
    return { success: false, error: 'linear plugin not yet implemented — contributions welcome!' }
  }
}

runOutputPlugin(new OutputPluginImpl())
