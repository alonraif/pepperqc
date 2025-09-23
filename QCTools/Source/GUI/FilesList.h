/*  Copyright (c) BAVC. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license that can
 *  be found in the License.html file in the root of the source tree.
 */

//---------------------------------------------------------------------------
#ifndef GraphLayout_H
#define GraphLayout_H

#include <QTableWidget>

#include "Core/Core.h"

class MainWindow;

class FilesList : public QTableWidget
{
    Q_OBJECT

public:
    explicit FilesList(MainWindow* Main);
    ~FilesList();

    // Commands
    void                        Update                      ();
    void                        Update                      (size_t File_Pos);
    void                        UpdateAll                   ();

protected:
    // File information
    MainWindow*                 Main;

    void showEvent(QShowEvent * Event);
    void contextMenuEvent   (QContextMenuEvent* Event);

private Q_SLOTS:

    void on_itemClicked(QTableWidgetItem * item);
    void on_itemDoubleClicked(QTableWidgetItem * item);
    void on_verticalHeaderClicked(int logicalIndex);
    void on_verticalHeaderDoubleClicked(int logicalIndex);
    void on_verticalHeaderContextMenuRequested(const QPoint& pos);

    void updateSignalServerCheckUploadedStatus();
    void updateSignalServerUploadStatus();
    void updateSignalServerUploadProgress(qint64, qint64);

private:
    void contextMenu(const QPoint& pos, const int& row);
};

#endif // GraphLayout_H
