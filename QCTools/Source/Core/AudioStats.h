/*  Copyright (c) BAVC. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license that can
 *  be found in the License.html file in the root of the source tree.
 */

//---------------------------------------------------------------------------
#ifndef AudioStats_H
#define AudioStats_H

#include "Core/Core.h"
#include "Core/CommonStats.h"

#include <string>
#include <vector>
#include <stdint.h>

struct AVFrame;
class QAVStream;

namespace tinyxml2 {
    class XMLElement;
}

class AudioStats : public CommonStats
{
public:
    // Constructor / Destructor
    AudioStats(size_t FrameCount=0, double Duration=0, QAVStream* stream = NULL);
    AudioStats(int streamIndex);
    ~AudioStats();

    // External data
    virtual void parseFrame(tinyxml2::XMLElement* frame);
    void                        StatsFromFrame(const QAVFrame& Frame, int Width, int Height);
    void                        TimeStampFromFrame(const QAVFrame& Frame, size_t FramePos);
    std::string                      StatsToXML(const activefilters& filters);
};

#endif // Stats_H
